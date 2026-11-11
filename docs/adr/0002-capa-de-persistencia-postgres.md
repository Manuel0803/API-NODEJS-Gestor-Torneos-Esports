# ADR 0002: Capa de Persistencia con PostgreSQL, SQL Directo y Bloqueo Pesimista

- **Estado:** Aceptado
- **Fecha:** 8 de Noviembre de 2026
- **Participantes:** Manuel, Tofanelli

---

## Contexto

El sistema debe garantizar que bajo concurrencia no se supere el cupo de un torneo, que dos reportes simultáneos de un partido no se pisen y que una anulación arbitral con cascada sea atómica. El dominio es independiente de la base de datos: los casos de uso reciben una `UnidadDeTrabajo` y trabajan con repositorios, sin conocer `pg`.

Hay tres decisiones a tomar: cómo hablar con PostgreSQL, cómo delimitar las transacciones y cómo evitar condiciones de carrera.

---

## Opciones Consideradas

### Acceso a datos

1. **ORM (Sequelize, Prisma):** reduce código repetitivo, pero oculta el SQL, dificulta controlar `FOR UPDATE` y el orden de bloqueos, y no es el foco evaluado en la materia.
2. **SQL directo con `pg` (Elegida):** control total de transacciones, bloqueos y consultas parametrizadas. Cada repositorio mapea filas a entidades de dominio.

### Control de concurrencia

1. **Bloqueo optimista con columna `version`:** no bloquea, pero obliga a reintentar y devuelve errores al cliente ante contención alta, como una inscripción masiva.
2. **Aislamiento `SERIALIZABLE`:** correcto, pero produce fallos de serialización que el caso de uso debería reintentar.
3. **Bloqueo pesimista con `SELECT ... FOR UPDATE` (Elegida):** serializa las operaciones sobre la misma fila. Quien llega segundo espera y luego ve el estado ya actualizado, por lo que la regla de negocio (`CupoAgotadoError`) se aplica con datos correctos.

---

## Decisión

1. Se usa `pg` con SQL directo y parámetros posicionales (`$1`, `$2`). Nunca se concatenan valores en las consultas.
2. `UnidadDeTrabajoPg.ejecutar` toma un cliente del pool, ejecuta `BEGIN`, entrega al caso de uso repositorios ligados a ese cliente y cierra con `COMMIT`. Ante cualquier error ejecuta `ROLLBACK` y relanza la excepción. El cliente se libera siempre.
3. `obtenerPorIdConBloqueo` en torneos y partidos usa `SELECT ... FOR UPDATE`. Todo caso de uso que modifica esas filas debe leerlas con bloqueo dentro de la transacción.
4. **Orden de bloqueo:** primero los partidos, de menor a mayor ronda, y el torneo al final. Un orden único evita interbloqueos (deadlocks) entre transacciones concurrentes.
5. Las reglas se defienden también en el esquema como última barrera: `CHECK (inscriptos_actuales <= cupo_maximo)`, `UNIQUE (torneo_id, equipo_id)`, `UNIQUE (torneo_id, jugador_id)`, claves foráneas con `ON DELETE RESTRICT` y listas cerradas de estados.
6. La columna `version` de `partidos` se incrementa en cada actualización y queda disponible para auditoría y diagnóstico. No se usa como mecanismo principal de control.
7. Las llamadas a servicios externos (Django) se hacen fuera de la transacción, para no retener bloqueos mientras se espera la red.
8. El pool se limita a 10 conexiones, con tiempo de espera de conexión de 5 segundos. El cierre ordenado del servidor ejecuta `pool.end()`.
9. Los partidos de una llave se insertan de la ronda mayor a la menor, porque cada partido referencia a su `siguiente_partido_id`.
10. El job de cierre de check-in consulta con `listarTorneosCheckinVencido`, una lectura fuera de transacción que luego dispara el caso de uso, el cual vuelve a leer el torneo con bloqueo.

---

## Evidencia

El test `tests/integracion/postgres-carrera-inscripciones.test.js` lanza 50 inscripciones simultáneas sobre un torneo de 10 cupos. Resultado esperado: exactamente 10 inscripciones, 40 rechazos por `CupoAgotadoError`, `inscriptos_actuales = 10` y órdenes de inscripción del 1 al 10 sin repetir.

Verificación negativa: al quitar `FOR UPDATE` del repositorio de torneos, el mismo test falla (entraron 9 en lugar de 10), lo que confirma que el bloqueo es el que evita la condición de carrera.

---

## Consecuencias

- **Positivas:**
  - El cupo y la integridad de la llave son consistentes aun con cientos de solicitudes simultáneas.
  - El dominio no conoce la base de datos: los mismos casos de uso corren con la versión en memoria en los tests unitarios.
  - Cada regla crítica tiene una segunda defensa en el esquema.
- **Negativas:**
  - Las inscripciones al mismo torneo se procesan una por una, lo que limita el rendimiento en picos de carga.
  - Un orden de bloqueo mal respetado en código nuevo puede causar interbloqueos. Hay que revisarlo en cada caso de uso.
  - Se escribe y mantiene más SQL a mano que con un ORM.

---

## Qué nos Haría Cambiar de Decisión

Que las pruebas de carga muestren que la espera por bloqueos sobre la fila del torneo supera el tiempo de respuesta aceptable. En ese caso se evaluaría un contador de cupos por separado o un mecanismo optimista con reintentos.