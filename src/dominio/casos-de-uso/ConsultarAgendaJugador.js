import { ESTADOS_PARTIDO } from '../entidades/Partido.js';

export class ConsultarAgendaJugador {
  constructor({ unidadDeTrabajo }) {
    this.unidadDeTrabajo = unidadDeTrabajo;
  }

  async ejecutar({ jugadorId }) {
    return this.unidadDeTrabajo.ejecutar(async ({ inscripciones, partidos }) => {
      const misInscripciones = await inscripciones.obtenerPorJugador(jugadorId);
      const agenda = [];

      for (const inscripcion of misInscripciones) {
        const partidosDelTorneo = await partidos.obtenerPorTorneo(inscripcion.torneoId);
        for (const partido of partidosDelTorneo) {
          const juegaEstaInscripcion = partido.equipoAId === inscripcion.equipoId
            || partido.equipoBId === inscripcion.equipoId;
          if (!juegaEstaInscripcion || partido.esBye || partido.estado === ESTADOS_PARTIDO.CONFIRMADO) {
            continue;
          }
          agenda.push({
            partidoId: partido.id,
            torneoId: partido.torneoId,
            ronda: partido.ronda,
            posicionEnRonda: partido.posicionEnRonda,
            estado: partido.estado,
            equipoId: inscripcion.equipoId,
            rivalEquipoId: partido.equipoAId === inscripcion.equipoId ? partido.equipoBId : partido.equipoAId,
          });
        }
      }

      return agenda.sort((a, b) => a.ronda - b.ronda || a.posicionEnRonda - b.posicionEnRonda);
    });
  }
}
