import { monitorEventLoopDelay } from 'node:perf_hooks';

export function crearMonitorEventLoop({ resolucionMs = 10 } = {}) {
  const histograma = monitorEventLoopDelay({ resolution: resolucionMs });
  histograma.enable();

  const aMilisegundos = (nanosegundos) => {
    if (!Number.isFinite(nanosegundos) || nanosegundos < 0) return 0;
    return Number((nanosegundos / 1e6).toFixed(2));
  };

  return {
    obtenerMetricas() {
      return {
        p50Ms: aMilisegundos(histograma.percentile(50)),
        p95Ms: aMilisegundos(histograma.percentile(95)),
        p99Ms: aMilisegundos(histograma.percentile(99)),
        maxMs: aMilisegundos(histograma.max)
      };
    },
    reiniciar() {
      histograma.reset();
    },
    detener() {
      histograma.disable();
    }
  };
}

