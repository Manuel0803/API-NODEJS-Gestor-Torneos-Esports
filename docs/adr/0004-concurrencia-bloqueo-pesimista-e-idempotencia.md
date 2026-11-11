# ADR 0004: Control de Concurrencia (Bloqueo Pesimista vs. Optimista) e Idempotencia HTTP

- **Estado:** Aceptado
- **Fecha:** 2026-11-10
- **Participantes:** Manuel, Franco Tofa

---

## Contexto

El sistema gestiona operaciones altamente concurrentes donde múltiples capitanes y árbitros mutan el mismo recurso en el mismo milisegundo. El Bloque 6 exige resolver de forma determinista dos carreras críticas y garantizar idempotencia ante reintentos de red:

1. **Carrera 1 (Inscripción simultánea a cupo limitado):** 50 equipos intentan inscribirse simultáneamente a un torneo con solo 10 cupos disponibles. Deben confirmarse exactamente 10 inscripciones (`orden_inscripcion` correlativo del 1 al 10) y rechazarse 40 sin superar jamás `cupo_maximo`.
2. **Carrera 2 (Doble reporte de resultados y resolución arbitral simultánea):** Ambos capitanes reportan resultados al mismo instante (o un árbitro resuelve/anula mientras ingresa un reporte tardío). El partido no puede perder actualizaciones (_lost update_), ni avanzar dos equipos a la siguiente ronda, ni quedar confirmado y en disputa a la vez.
3. **Idempotencia de peticiones mutadoras:** Ante cortes de red o reintentos automáticos del cliente HTTP, repetir una petición `POST` con la misma clave `Idempotency-Key` debe producir el efecto de negocio una única vez y devolver exactamente la misma respuesta original.

---

## Opciones Consideradas

### Opción 1: Bloqueo Pesimista de Fila (`SELECT ... FOR UPDATE`) dentro de Transacción SQL + Tabla `claves_idempotencia` con Huella SHA-256

- **Para las carreras de torneo y partido:** Dentro de la transacción `BEGIN ... COMMIT` de `UnidadDeTrabajoPg`, se bloquea explícitamente la fila raíz del agregado (`SELECT * FROM torneos WHERE id = $1 FOR UPDATE` al inscribir/armar llave y `SELECT * FROM partidos WHERE id = $1 FOR UPDATE` al reportar/arbitrar), complementado por la restricción de integridad `CONSTRAINT chk_cupo_no_excedido CHECK (inscriptos_actuales <= cupo_maximo)` y `UNIQUE (torneo_id, jugador_id)` en PostgreSQL.
- **Para la idempotencia HTTP:** El middleware `idempotencia.js` exige el encabezado `Idempotency-Key`, calcula un hash SHA-256 (`huella_peticion`) sobre el método, ruta y cuerpo JSON canónico, y consulta/almacena el resultado (`codigo_http`, `cuerpo_respuesta`) en `claves_idempotencia` indexado por `(usuario_id, clave)`.

- **Pros:**
  - **Serialización garantizada en base de datos:** En la carrera de 50 equipos por 10 cupos, PostgreSQL encola los 50 intentos sobre la fila del torneo; los primeros 10 ven `inscriptos_actuales < 10`, incrementan el contador con `orden_inscripcion` exacto y hacen `COMMIT`, mientras que los 40 restantes leen inmediatamente `inscriptos_actuales = 10` y reciben `CupoAgotadoError` (`409 Conflict`) sin falsos rechazos.
  - **Prevención total de _lost updates_ en partidos:** El segundo reporte simultáneo espera a que el primero confirme su transacción, leyendo ya el `reporte_equipo_a` cargado y disparando de forma determinista el paso a `CONFIRMADO` (si coincide) o `EN_DISPUTA` (si contradice).
  - **Detección de reutilización indebida de clave:** Al comparar la `huella_peticion` SHA-256, si un cliente reutiliza la misma `Idempotency-Key` con un cuerpo distinto recibe `422 Unprocessable Entity`, y si es el mismo cuerpo recibe la respuesta cacheada con el encabezado `Idempotent-Replayed: true`.
- **Contras:**
  - Las transacciones que compiten por el mismo torneo o partido esperan en fila mientras dura la transacción poseedora del lock (mitigado manteniendo las transacciones cortas y realizando las llamadas HTTP externas fuera del bloqueo o con timeout estricto).

### Opción 2: Control de Concurrencia Optimista puro (`WHERE version = $expected`) sin `FOR UPDATE`

- Leer la fila sin bloqueo y ejecutar `UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2`, abortando si `rowCount === 0`.

- **Pros:**
  - No retiene locks de fila durante la lectura inicial.
- **Contras:**
  - **Falsos rechazos masivos bajo contención legítima:** Si 50 equipos se inscriben al mismo tiempo cuando hay 10 lugares libres, los 50 leen `version = 1`; solo 1 gana el `UPDATE` y los otros 49 fallan por colisión de versión aunque todavía quedaban 9 cupos vacíos, obligando a implementar bucles de reintentos complejos.

---

## Decisión

Elegimos la **Opción 1: Bloqueo Pesimista (`SELECT ... FOR UPDATE`) dentro de transacciones `READ COMMITTED` combinado con restricciones `CHECK`/`UNIQUE` en PostgreSQL y almacenamiento de `Idempotency-Key` con huella SHA-256**. Conservamos además el incremento de la columna `version` en `partidos` como trazabilidad de auditoría de cuántas transiciones sufrió cada encuentro.

---

## Consecuencias

- **Positivas:**
  - Cumplimiento exacto de las Carreras Obligatorias 1 y 2 sin reintentos espurios ni pérdida de reportes.
  - Idempotencia verificable de extremo a extremo tanto en memoria (`UnidadDeTrabajoMemoria`) como en PostgreSQL (`claves_idempotencia`).
- **Negativas / Compromisos:**
  - Requiere disciplina para adquirir siempre los bloqueos en orden consistente (Torneo antes que Inscripción/Partido, y Partido actual siguiendo la cadena `siguiente_partido_id` hacia adelante) evitando _deadlocks_.

---

## Qué nos haría cambiar de decisión

Si las transacciones de inscripción requirieran mantener abierta la conexión durante varios segundos esperando procesos humanos o colas externas lentas, separaríamos la reserva de cupo en dos fases o utilizaríamos bloqueo optimista con cola de reintentos en background.
