# ADR 0005: Delegación de Tareas Intensivas en CPU (Llave de 1024 Participantes y Recálculo de ELO) mediante `worker_threads`

- **Estado:** Aceptado
- **Fecha:** 2026-11-17
- **Participantes:** Manuel, Franco Tofa

---

## Contexto

El Bloque 7 del contrato técnico exige procesar una operación intensiva en CPU: generar la llave completa de eliminación simple y el calendario de partidos para un torneo de al menos **1024 participantes** (1023 encuentros distribuidos en 10 rondas con asignación determinista de cruces y horarios) junto con el recálculo masivo del ranking histórico (`puntos_elo`) de miles de jugadores.

Dado que Node.js ejecuta el código JavaScript sobre un único hilo principal (*Event Loop*), ejecutar este cálculo de forma sincrónica en el hilo principal congela la atención de nuevas peticiones HTTP (`GET /health`, reportes de resultados de capitanes y resoluciones arbitrales) durante todo el tiempo que dura el procesamiento de CPU.

---

## Opciones Consideradas

### Opción 1:Ejecución Sincrónica en el Hilo Principal (Versión Ingenua)

Ejecutar el armado de los 1023 partidos y las iteraciones matemáticas de ELO directamente dentro del handler HTTP en el hilo principal.

- **Pros:**
  - Simplicidad de implementación sin transferencia de mensajes entre hilos.
- **Contras:**
  - **Bloqueo total del Event Loop:** Mientras dura el cálculo intensivo, el *lag* medido con `monitorEventLoopDelay` (`node:perf_hooks`) se dispara a decenas o cientos de milisegundos, degradando severamente la latencia `p95`/`p99` de `/health` y de cualquier partido en curso.

### Opción 2: Delegación a Hilos de Trabajo con `node:worker_threads` (Versión Óptima)

Ejecutar la función intensiva de armado de llave masiva y recálculo de ELO dentro de un `Worker` aislado (`src/infra/workers/workerLlaveElo.js`), pasando los parámetros por `workerData` y recibiendo el resultado asincrónicamente mediante `parentPort.postMessage`.

- **Pros:**
  - **Desbloqueo del Event Loop principal:** El cálculo matemático corre en otro núcleo del procesador mientras el hilo principal de Express continúa respondiendo `GET /health` y reportes de partidos con latencia mínima (`~1-2 ms`).
  - **Menor costo de memoria y arranque que procesos separados:** A diferencia de `child_process.fork()`, un `worker_thread` comparte el mismo proceso del sistema operativo con menor huella de RAM.
- **Contras:**
  - Introduce un pequeño overhead de serialización (`structured clone`) al enviar los datos de entrada y salida entre el hilo principal y el worker.

### Opción 3: Procesos Hijos con `node:child_process.fork()`

Levantar un proceso Node.js separado por cada cálculo pesado.

- **Pros:**
  - Aislamiento completo de memoria a nivel de proceso del sistema operativo.
- **Contras:**
  - Consume aproximadamente `30-40 MB` adicionales de RAM base por proceso creado y tiene un tiempo de arranque significativamente mayor que un `worker_thread`.

---

## Decisión

Elegimos la **Opción 2: Delegación a `node:worker_threads` (`src/infra/workers/workerLlaveElo.js`)**, conservando además la **Opción 1 (`modo: 'ingenuo'`)** parametrizable en `POST /torneos/simulacion-masiva` y instrumentando el servidor con `monitorEventLoopDelay` (`node:perf_hooks`) para demostrar empíricamente la diferencia de latencia y lag del Event Loop en `docs/mediciones.md` y en el Punto 7 de la Demo.

---

## Consecuencias

- **Positivas:**
  - El servidor mantiene baja latencia (`p99`) en `/health` y en operaciones de torneos activos incluso cuando un organizador dispara el cálculo masivo de 1024 participantes y miles de jugadores ELO.
  - El endpoint `GET /health` reporta en tiempo real las métricas `{ p50, p99, max }` del Event Loop en milisegundos.
- **Negativas / Compromisos:**
  - El código ejecutado dentro del worker debe mantenerse puro y sin compartir instancias de conexión del pool HTTP principal.

---

## Qué nos haría cambiar de decisión

Si la frecuencia de generación de llaves de 1024 participantes fuera de decenas por segundo de forma sostenida, implementaríamos un *Worker Pool* fijo (con tamaño acotado a `os.availableParallelism() - 1`) o una cola de trabajos dedicada para evitar crear demasiados hilos simultáneos.

