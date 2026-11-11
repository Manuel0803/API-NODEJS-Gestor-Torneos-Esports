import { randomUUID } from 'node:crypto';
import {
  EntidadNoEncontradaError,
  PermisoDenegadoError,
  JugadorYaInscriptoError,
  ReglaDeNegocioError,
} from '../errores/index.js';
import { Inscripcion } from '../entidades/Inscripcion.js';

export class InscribirEquipo {
  constructor({ unidadDeTrabajo, reloj, proveedorIdentidad = null }) {
    this.unidadDeTrabajo = unidadDeTrabajo;
    this.reloj = reloj;
    this.proveedorIdentidad = proveedorIdentidad;
  }

  async ejecutar({ torneoId, equipoId, jugadoresIds, usuarioSolicitanteId }) {
    if (this.proveedorIdentidad) {
      await this.proveedorIdentidad.verificarJugadores(jugadoresIds);
    }

    return this.unidadDeTrabajo.ejecutar(async ({ torneos, equipos, inscripciones }) => {
      const torneo = await torneos.obtenerPorIdConBloqueo(torneoId);
      if (!torneo) throw new EntidadNoEncontradaError('Torneo', torneoId);

      const equipo = await equipos.obtenerPorId(equipoId);
      if (!equipo) throw new EntidadNoEncontradaError('Equipo', equipoId);
      if (!equipo.esCapitan(usuarioSolicitanteId)) throw new PermisoDenegadoError();

      const yaInscripto = await inscripciones.obtenerPorTorneoYEquipo(torneoId, equipoId);
      if (yaInscripto) {
        throw new ReglaDeNegocioError('El equipo ya está inscripto en este torneo', { torneoId, equipoId });
      }

      for (const jugadorId of jugadoresIds) {
        const repetido = await inscripciones.jugadorYaInscriptoEnTorneo(torneoId, jugadorId);
        if (repetido) throw new JugadorYaInscriptoError(jugadorId, torneoId);
      }

      const inscripcion = new Inscripcion({
        id: randomUUID(),
        torneoId,
        equipoId,
        jugadoresIds,
        ordenInscripcion: torneo.inscriptosActuales + 1,
      });
      inscripcion.validarTamano(torneo.tamanoEquipo);

      torneo.registrarInscripcion(this.reloj.ahora());
      await torneos.guardar(torneo);
      await inscripciones.guardar(inscripcion);
      return inscripcion;
    });
  }
}
