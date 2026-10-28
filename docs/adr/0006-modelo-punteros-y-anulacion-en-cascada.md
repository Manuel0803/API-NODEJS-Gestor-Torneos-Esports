# ADR 0006: Modelo de Punteros para Árbol de Llaves y Resolución de Anulación en Cascada

- **Estado:** Aceptado
- **Fecha:** 28 de Octubre de 2026
- **Participantes:** Manuel, Tofanelli

---

## Contexto

El sistema gestiona torneos de eliminación simple estructurados como un árbol binario. Para conectar los partidos entre rondas sin acoplar la base de datos a estructuras jerárquicas rígidas, cada partido almacena `siguiente_partido_id` y `slot_siguiente` ('A' o 'B').

Durante la revisión técnica del código de dominio realizada por Tofanelli, se detectó una falla crítica en el ciclo de vida del partido:

1. `ANULADO` estaba modelado como un estado terminal irreversible. Si un árbitro anulaba un partido confirmado, la cascada revertía los partidos subsiguientes a `PENDIENTE` a la espera de un ganador, pero el partido anulado no permitía volver a reportar ni disputarse (`PartidoNoModificableError`). Esto producía un **bloqueo definitivo (deadlock) de la llave**.
2. Al revertir un slot (`revertirSlot`), solo se limpiaba el slot del equipo anulado, dejando intacto el reporte previo del rival en el otro slot, lo que provocaba comparaciones erróneas ("reportes residuales") cuando un nuevo contrincante avanzaba.
3. Capitanes podían reportar en estado `EN_DISPUTA`, eludiendo la mediación arbitral.

---

## Opciones Consideradas

### Opción 1: Estado terminal ANULADO con asignación obligatoria de ganador por descalificación

El árbitro anula el partido pero está obligado a declarar un ganador por W.O. (el rival del infractor). El partido pasa a `ANULADO` o `CONFIRMADO` con el nuevo ganador avanzando a la siguiente ronda.

- **Ventajas:** No requiere lógica de reapertura; la llave siempre avanza hacia adelante.
- **Desventajas:** Impide repetir partidos en casos de fallos técnicos de servidor, empates no previstos o decisiones arbitrales que ordenan jugar de nuevo. Obliga a designar un ganador ficticio o dejar el cuadro incompleto.

### Opción 2: Máquina de estados con reapertura (`reabrirParaRejugar`), auditoría previa y limpieza simétrica de slots (Elegida)

Permitir que un partido anulado capture su `estadoAnterior` (ganador previo, reportes y evidencias para `auditoria_arbitral`), limpie los reportes de ambos equipos y retorne a `EN_JUEGO`. La función `revertirSlot` limpia el equipo asignado y resetea incondicionalmente los reportes de ambos slots en las rondas siguientes.

- **Ventajas:** Resuelve de raíz el deadlock de la llave. Permite tanto la repetición del partido como la descalificación. Elimina por completo los reportes residuales en rondas avanzadas y garantiza trazabilidad inmutable mediante auditoría.
- **Desventajas:** Requiere soportar la transición `ANULADO -> EN_JUEGO` y coordinar la recursión en la base de datos bajo transacción.

---

## Decisión

Se adopta la **Opción 2**:

1. `Partido.anularPorArbitro` captura el `estadoAnterior` completo y admite la opción `reabrir: true` para regresar a `EN_JUEGO`.
2. Se implementa `Partido.reabrirParaRejugar()` para destrabar partidos anulados cuando el árbitro autorice la repetición del juego.
3. `Partido.revertirSlot` resetea incondicionalmente los reportes y evidencias de ambos contrincantes (`reporteEquipoA = null`, `reporteEquipoB = null`, `evidenciaAUrl = null`, `evidenciaBUrl = null`).
4. Se bloquea el método `registrarReporte` si el partido está en `EN_DISPUTA`, otorgando exclusividad resolutiva al `ARBITRO`.

---

## Consecuencias

- **Positivas:**
  - La llave de torneo es 100% consistente y recuperable frente a fallos o sanciones arbitrales.
  - No quedan "reportes fantasma" en memoria ni en base de datos al subir nuevos clasificados.
  - Se preserva el historial de auditoría exigido por la cátedra para la defensa oral individual.
- **Negativas:**
  - El caso de uso `AnularPartidoCasoUso` debe ejecutar una transacción SQL que recorra recursivamente los punteros `siguiente_partido_id` aplicando bloqueos pesimistas (`FOR UPDATE`).

---

## Qué nos Haría Cambiar de Decisión

Que el reglamento deportivo oficial de la materia prohíba de forma estricta la repetición de partidos bajo cualquier circunstancia y exija que toda anulación resulte en la descalificación inmediata de ambos participantes y cancelación del torneo.
