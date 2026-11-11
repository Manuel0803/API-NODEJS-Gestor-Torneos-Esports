import { EntidadNoEncontradaError } from '../errores/index.js';
import { Partido, ESTADOS_PARTIDO } from '../entidades/Partido.js';
import { ESTADOS_INSCRIPCION } from '../entidades/Inscripcion.js';

export class CerrarCheckinYArmarLlave {
  constructor({ unidadDeTrabajo, reloj, notificador = null }) {
    this.unidadDeTrabajo = unidadDeTrabajo;
    this.reloj = reloj;
    this.notificador = notificador;
  }

  async ejecutar({ torneoId }) {
    const ahora = this.reloj.ahora();
    const partidosGenerados = await this.unidadDeTrabajo.ejecutar(async ({ torneos, inscripciones, partidos }) => {
      const torneo = await torneos.obtenerPorIdConBloqueo(torneoId);
      if (!torneo) throw new EntidadNoEncontradaError('Torneo', torneoId);

      const todas = await inscripciones.obtenerPorTorneo(torneoId);
      const presentes = todas.filter((i) => i.participaDelSorteo());
      const ausentes = todas.filter((i) => i.estado === ESTADOS_INSCRIPCION.CONFIRMADA && !i.checkinConfirmado);

      if (presentes.length < 2) {
        torneo.cancelarPorFaltaDeComparecencia({ fechaActual: ahora, cantidadConfirmados: presentes.length });
        ausentes.forEach((i) => i.eliminarPorWO());
        await torneos.guardar(torneo);
        for (const inscripcion of ausentes) {
          await inscripciones.guardar(inscripcion);
        }
        return [];
      }

      torneo.iniciarTorneo({ fechaActual: ahora, cantidadConfirmados: presentes.length });
      const generados = torneo
        .generarEstructuraLlave(presentes)
        .map((datos) => new Partido(datos));

      ausentes.forEach((i) => i.eliminarPorWO());
      await torneos.guardar(torneo);
      for (const inscripcion of ausentes) {
        await inscripciones.guardar(inscripcion);
      }
      await partidos.guardarTodos(generados);
      return generados;
    });

    if (this.notificador && partidosGenerados.length > 0) {
      const enJuego = partidosGenerados.filter((p) => p.estado === ESTADOS_PARTIDO.EN_JUEGO && !p.esBye);
      for (const partido of enJuego) {
        await this.notificador.notificarProximoPartido(partido);
      }
    }

    return partidosGenerados;
  }
}
