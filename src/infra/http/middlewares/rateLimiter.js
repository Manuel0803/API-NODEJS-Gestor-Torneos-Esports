import rateLimit from 'express-rate-limit';
import { obtenerCorrelationId } from './contextoCorrelacion.js';

export function crearRateLimiter({
  ventanaMs = 60 * 1000,
  maxPeticiones = 10,
  mensaje = 'Demasiadas peticiones desde esta direccion IP. Intente nuevamente mas tarde.'
} = {}) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maxPeticiones,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      const segundosRestantes = Math.max(1, Math.ceil(ventanaMs / 1000));
      const correlationId = obtenerCorrelationId();

      res.setHeader('Retry-After', String(segundosRestantes));
      res.status(429).type('application/problem+json').json({
        type: 'https://api.torneos.esports/errores/limite-peticiones',
        title: 'Demasiadas peticiones',
        status: 429,
        detail: mensaje,
        instance: req.originalUrl,
        ...(correlationId ? { correlationId } : {})
      });
    }
  });
}

