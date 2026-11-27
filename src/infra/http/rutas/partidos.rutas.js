import { Router } from 'express';
import {
  esquemaReportarResultado,
  esquemaResolverDisputa,
  esquemaAnularPartido
} from '../esquemas/partidos.esquema.js';

export function crearRutasPartidos({
  controlador,
  verificarToken,
  exigirRoles,
  validarEsquema,
  middlewareIdempotencia = (_req, _res, next) => next()
}) {
  const router = Router();

  router.post(
    '/partidos/:id/reportes',
    verificarToken,
    exigirRoles('CAPITAN'),
    validarEsquema(esquemaReportarResultado),
    middlewareIdempotencia,
    controlador.reportar
  );

  router.post(
    '/partidos/:id/resolver-disputa',
    verificarToken,
    exigirRoles('ARBITRO'),
    validarEsquema(esquemaResolverDisputa),
    middlewareIdempotencia,
    controlador.resolverDisputa
  );

  router.post(
    '/partidos/:id/anular',
    verificarToken,
    exigirRoles('ARBITRO'),
    validarEsquema(esquemaAnularPartido),
    middlewareIdempotencia,
    controlador.anular
  );

  return router;
}
