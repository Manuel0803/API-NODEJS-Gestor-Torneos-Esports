import { EntidadNoEncontradaError } from '../errores/index.js';

export class ResolverDisputa {
  constructor({ unidadDeTrabajo, reloj }) {
    this.unidadDeTrabajo = unidadDeTrabajo;
    this.reloj = reloj;                        
  }

  async ejecutar({ partidoId, arbitroId, ganadorId, motivo }) {
    return this.unidadDeTrabajo.ejecutar(async ({ partidos, torneos, auditoria }) => { 
      const partido = await partidos.obtenerPorIdConBloqueo(partidoId); 
      if (!partido) throw new EntidadNoEncontradaError('Partido', partidoId);

      const estadoAnterior = {                 
        estado: partido.estado,
        ganadorId: partido.ganadorId,
        reporteEquipoA: partido.reporteEquipoA,
        reporteEquipoB: partido.reporteEquipoB,
        evidenciaAUrl: partido.evidenciaAUrl,
        evidenciaBUrl: partido.evidenciaBUrl,
      };

      const respuesta = partido.resolverDisputaArbitral({ arbitroId, ganadorId, motivo }); 

      if (respuesta.siguientePartidoId) {      
        const siguiente = await partidos.obtenerPorIdConBloqueo(respuesta.siguientePartidoId);
        if (!siguiente) throw new EntidadNoEncontradaError('Partido', respuesta.siguientePartidoId); 
        siguiente.asignarEquipo(respuesta.slotSiguiente, respuesta.ganadorId);
        await partidos.guardar(siguiente);
      } else {                                 
        const torneo = await torneos.obtenerPorIdConBloqueo(partido.torneoId); 
        if (!torneo) throw new EntidadNoEncontradaError('Torneo', partido.torneoId);
        torneo.finalizarTorneo({ partidoFinal: partido });
        await torneos.guardar(torneo);
      }

      await auditoria.guardar({                
        partidoId: partido.id,
        arbitroId,
        accion: 'RESOLUCION_DISPUTA',
        motivo,
        estadoAnterior,
        fecha: this.reloj.ahora(),
      });
      await partidos.guardar(partido);         
      return respuesta;
    });
  }
}