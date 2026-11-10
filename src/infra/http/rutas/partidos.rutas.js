import { Router } from 'express';
import {
  esquemaReportarResultado,
  esquemaResolverDisputa,
  esquemaAnularPartido
} from '../esquemas/partidos.esquema.js';

export function crearRutasPartidos({ controlador, verificarToken, exigirRoles, validarEsquema }) {
  const router = Router();

  router.post(
    '/partidos/:id/reportes',
    verificarToken,
    exigirRoles('CAPITAN'),
    validarEsquema(esquemaReportarResultado),
    controlador.reportar
  );

  router.post(
    '/partidos/:id/resolver-disputa',
    verificarToken,
    exigirRoles('ARBITRO'),
    validarEsquema(esquemaResolverDisputa),
    controlador.resolverDisputa
  );

  router.post(
    '/partidos/:id/anular',
    verificarToken,
    exigirRoles('ARBITRO'),
    validarEsquema(esquemaAnularPartido),
    controlador.anular
  );

  return router;
}
