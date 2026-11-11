import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const almacenamientoCorrelacion = new AsyncLocalStorage();

export function obtenerCorrelationId() {
  const tienda = almacenamientoCorrelacion.getStore();
  return tienda?.correlationId ?? null;
}

export const logger = {
  info(mensaje, metadatos = {}) {
    const correlationId = obtenerCorrelationId();
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        nivel: 'info',
        ...(correlationId ? { correlationId } : {}),
        mensaje,
        ...metadatos
      })
    );
  },

  error(mensaje, metadatos = {}) {
    const correlationId = obtenerCorrelationId();
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        nivel: 'error',
        ...(correlationId ? { correlationId } : {}),
        mensaje,
        ...metadatos
      })
    );
  }
};

export function middlewareCorrelacion(req, res, next) {
  const cabeceraRecibida = req.headers['x-correlation-id'];
  const correlationId =
    typeof cabeceraRecibida === 'string' && cabeceraRecibida.trim().length > 0
      ? cabeceraRecibida.trim()
      : randomUUID();

  res.setHeader('X-Correlation-Id', correlationId);

  almacenamientoCorrelacion.run({ correlationId }, () => {
    next();
  });
}

