import { Router } from 'express';
import {
  esquemaCrearEquipo,
  esquemaListarEquipos,
  esquemaAgendaJugador
} from '../esquemas/equipos.esquema.js';

export function crearRutasEquipos({ controlador, verificarToken, exigirRoles, validarEsquema }) {
  const router = Router();

  router.post(
    '/equipos',
    verificarToken,
    exigirRoles('CAPITAN'),
    validarEsquema(esquemaCrearEquipo),
    controlador.crear
  );

  router.get(
    '/equipos',
    verificarToken,
    exigirRoles('CAPITAN'),
    validarEsquema(esquemaListarEquipos),
    controlador.listar
  );

  router.get(
    '/jugadores/me/agenda',
    verificarToken,
    exigirRoles('JUGADOR', 'CAPITAN'),
    validarEsquema(esquemaAgendaJugador),
    controlador.agenda
  );

  return router;
}
