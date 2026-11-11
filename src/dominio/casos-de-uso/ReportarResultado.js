import { EntidadNoEncontradaError, PermisoDenegadoError } from '../errores/index.js';

export class ReportarResultado {
  constructor({ unidadDeTrabajo, almacenEvidencias = null, notificador = null }) {
    this.unidadDeTrabajo = unidadDeTrabajo;
    this.almacenEvidencias = almacenEvidencias;
    this.notificador = notificador;
  }

  async ejecutar({ partidoId, equipoId, resultado, evidenciaUrl = null, usuarioSolicitanteId }) {
    let urlEvidenciaFinal = evidenciaUrl;
    if (this.almacenEvidencias && evidenciaUrl) {
      const registrada = await this.almacenEvidencias.registrarEvidencia({
        partidoId,
        equipoId,
        evidenciaUrl,
      });
      urlEvidenciaFinal = registrada?.url ?? evidenciaUrl;
    }

    const respuesta = await this.unidadDeTrabajo.ejecutar(async ({ torneos, equipos, partidos }) => {
      const partido = await partidos.obtenerPorIdConBloqueo(partidoId);
      if (!partido) throw new EntidadNoEncontradaError('Partido', partidoId);

      const equipo = await equipos.obtenerPorId(equipoId);
      if (!equipo) throw new EntidadNoEncontradaError('Equipo', equipoId);
      if (!equipo.esCapitan(usuarioSolicitanteId)) throw new PermisoDenegadoError();

      const reporte = partido.registrarReporte({ equipoId, resultado, evidenciaUrl: urlEvidenciaFinal });
      await partidos.guardar(partido);

      if (reporte.avanza) {
        if (reporte.siguientePartidoId) {
          const siguiente = await partidos.obtenerPorIdConBloqueo(reporte.siguientePartidoId);
          if (!siguiente) throw new EntidadNoEncontradaError('Partido', reporte.siguientePartidoId);
          siguiente.asignarEquipo(reporte.slotSiguiente, reporte.ganadorId);
          await partidos.guardar(siguiente);
        } else {
          const torneo = await torneos.obtenerPorIdConBloqueo(partido.torneoId);
          torneo.finalizarTorneo({ partidoFinal: partido });
          await torneos.guardar(torneo);
        }
      }

      return {
        partidoId: partido.id,
        estado: partido.estado,
        ganadorId: partido.ganadorId,
        enDisputa: reporte.enDisputa,
      };
    });

    if (respuesta.enDisputa && this.notificador) {
      await this.notificador.notificarPartidoEnDisputa({
        partidoId: respuesta.partidoId,
        reportadoPorEquipoId: equipoId,
      });
    }

    return respuesta;
  }
}
