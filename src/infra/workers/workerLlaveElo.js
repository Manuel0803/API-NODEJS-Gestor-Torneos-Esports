import { parentPort, workerData } from 'node:worker_threads';
import { ejecutarSimulacionMasiva } from './tareaPesadaTorneo.js';

try {
  const resultado = ejecutarSimulacionMasiva(workerData ?? {});
  parentPort?.postMessage({ ok: true, resultado });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: error?.message ?? 'Error inesperado ejecutando tarea pesada en worker'
  });
}

