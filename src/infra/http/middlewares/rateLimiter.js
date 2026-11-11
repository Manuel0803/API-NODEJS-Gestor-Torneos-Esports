import { obtenerCorrelationId } from './contextoCorrelacion.js';

export function crearRateLimiter({
  ventanaMs = 60 * 1000,
  maxPeticiones = 10,
  mensaje = 'Demasiadas peticiones desde esta direccion IP. Intente nuevamente mas tarde.'
} = {}) {
  const registrosPorIp = new Map();

  const limpiarExpirados = (ahora) => {
    for (const [clave, registro] of registrosPorIp.entries()) {
      if (ahora >= registro.reinicioEn) {
        registrosPorIp.delete(clave);
      }
    }
  };

  return function middlewareRateLimit(req, res, next) {
    const ahora = Date.now();
    limpiarExpirados(ahora);

    const ip = req.ip || req.socket?.remoteAddress || 'anonimo';
    let registro = registrosPorIp.get(ip);

    if (!registro || ahora >= registro.reinicioEn) {
      registro = {
        conteo: 0,
        reinicioEn: ahora + ventanaMs
      };
      registrosPorIp.set(ip, registro);
    }

    registro.conteo += 1;

    const restantes = Math.max(0, maxPeticiones - registro.conteo);
    const segundosRestantes = Math.max(1, Math.ceil((registro.reinicioEn - ahora) / 1000));

    res.setHeader('RateLimit-Limit', String(maxPeticiones));
    res.setHeader('RateLimit-Remaining', String(restantes));
    res.setHeader('RateLimit-Reset', String(segundosRestantes));

    if (registro.conteo > maxPeticiones) {
      const correlationId = obtenerCorrelationId();
      res.setHeader('Retry-After', String(segundosRestantes));
      return res.status(429).type('application/problem+json').json({
        type: 'https://api.torneos.esports/errores/limite-peticiones',
        title: 'Demasiadas peticiones',
        status: 429,
        detail: mensaje,
        instance: req.originalUrl,
        ...(correlationId ? { correlationId } : {})
      });
    }

    return next();
  };
}
