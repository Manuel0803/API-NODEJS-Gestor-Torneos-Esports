import { Router } from 'express';
import { esquemaRegistro, esquemaLogin } from '../esquemas/auth.esquema.js';
import { validarEsquema } from '../middlewares/validarEsquema.js';
import { crearRateLimiter } from '../middlewares/rateLimiter.js';

export function crearRutasAuth({
  controladorAuth,
  verificarToken,
  maxIntentosLogin = 10,
  ventanaLoginMs = 60 * 1000
}) {
  const router = Router();
  const limitadorLogin = crearRateLimiter({
    ventanaMs: ventanaLoginMs,
    maxPeticiones: maxIntentosLogin,
    mensaje: 'Demasiados intentos de inicio de sesion. Intente nuevamente mas tarde.'
  });

  router.post(
    '/registro',
    validarEsquema({ body: esquemaRegistro }),
    controladorAuth.registrar
  );

  router.post(
    '/login',
    limitadorLogin,
    validarEsquema({ body: esquemaLogin }),
    controladorAuth.login
  );

  router.get('/me', verificarToken, controladorAuth.perfilActual);

  return router;
}

