import { Router } from 'express';
import { ROLES_USUARIO } from '../../../dominio/entidades/Usuario.js';
import { exigirRoles } from '../middlewares/autenticacion.js';
import { validarEsquema } from '../middlewares/validarEsquema.js';
import { crearRateLimiter } from '../middlewares/rateLimiter.js';
import {
  esquemaParametroId,
  esquemaCrearTorneo,
  esquemaInscribirEquipo,
  esquemaConfirmarCheckin
} from '../esquemas/torneos.esquema.js';

export function crearRutasTorneos({
  controladorTorneos,
  verificarToken,
  maxPeticionesLlave = 5,
  ventanaLlaveMs = 60 * 1000
}) {
  const router = Router();

  const limitadorLlave = crearRateLimiter({
    ventanaMs: ventanaLlaveMs,
    maxPeticiones: maxPeticionesLlave,
    mensaje: 'Limite de generacion de llaves alcanzado. Intente nuevamente mas tarde.'
  });

  router.get('/', controladorTorneos.listar);

  router.post(
    '/',
    verificarToken,
    exigirRoles(ROLES_USUARIO.ORGANIZADOR),
    validarEsquema({ body: esquemaCrearTorneo }),
    controladorTorneos.crear
  );

  router.post(
    '/:id/inscripciones',
    verificarToken,
    exigirRoles(ROLES_USUARIO.CAPITAN),
    validarEsquema({ params: esquemaParametroId, body: esquemaInscribirEquipo }),
    controladorTorneos.inscribir
  );

  router.post(
    '/:id/checkin',
    verificarToken,
    exigirRoles(ROLES_USUARIO.CAPITAN),
    validarEsquema({ params: esquemaParametroId, body: esquemaConfirmarCheckin }),
    controladorTorneos.confirmarCheckin
  );

  router.post(
    '/:id/llave',
    limitadorLlave,
    verificarToken,
    exigirRoles(ROLES_USUARIO.ORGANIZADOR),
    validarEsquema({ params: esquemaParametroId }),
    controladorTorneos.armarLlave
  );

  router.get(
    '/:id/llave-publica',
    validarEsquema({ params: esquemaParametroId }),
    controladorTorneos.obtenerLlavePublica
  );

  return router;
}

