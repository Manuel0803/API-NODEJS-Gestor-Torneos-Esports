import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { validarEsquema } from '../middlewares/validarEsquema.js';
import { logger, obtenerCorrelationId } from '../middlewares/contextoCorrelacion.js';

const esquemaEventoIntegracion = z.object({
  tipo: z.string().trim().min(1),
  datos: z.record(z.unknown())
});

function tokenServicioValido(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string') {
    return false;
  }
  const bufRecibido = Buffer.from(recibido, 'utf8');
  const bufEsperado = Buffer.from(esperado, 'utf8');
  if (bufRecibido.length === 0 || bufRecibido.length !== bufEsperado.length) {
    return false;
  }
  return timingSafeEqual(bufRecibido, bufEsperado);
}

export function crearRutasIntegracion({ internalServiceSecret }) {
  const router = Router();

  router.post(
    '/eventos',
    (req, res, next) => {
      const tokenRecibido = req.headers['x-service-token'];
      if (!tokenServicioValido(tokenRecibido, internalServiceSecret)) {
        const correlationId = obtenerCorrelationId();
        return res.status(401).type('application/problem+json').json({
          type: 'https://api.torneos.esports/errores/no-autenticado',
          title: 'No autenticado',
          status: 401,
          detail: 'Token de servicio invalido o ausente.',
          instance: req.originalUrl,
          ...(correlationId ? { correlationId } : {})
        });
      }
      return next();
    },
    validarEsquema({ body: esquemaEventoIntegracion }),
    (req, res) => {
      const { tipo, datos } = req.body;
      logger.info('Evento de integracion recibido desde Django', { tipo, datos });
      return res.status(202).json({ recibido: true, tipo });
    }
  );

  return router;
}
