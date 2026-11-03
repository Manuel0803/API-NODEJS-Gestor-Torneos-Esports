import { EntidadNoEncontradaError, PermisoDenegadoError } from '../errores/index.js'; 

export class ReportarResultado {
  constructor({ unidadDeTrabajo }) {           
    this.unidadDeTrabajo = unidadDeTrabajo;    
  }

  async ejecutar({ partidoId, equipoId, resultado, evidenciaUrl = null, usuarioSolicitanteId }) { 
    return this.unidadDeTrabajo.ejecutar(async ({ torneos, equipos, partidos }) => { 
      const partido = await partidos.obtenerPorIdConBloqueo(partidoId); 
      if (!partido) throw new EntidadNoEncontradaError('Partido', partidoId); 

      const equipo = await equipos.obtenerPorId(equipoId);           
      if (!equipo) throw new EntidadNoEncontradaError('Equipo', equipoId); 
      if (!equipo.esCapitan(usuarioSolicitanteId)) throw new PermisoDenegadoError(); 

      const reporte = partido.registrarReporte({ equipoId, resultado, evidenciaUrl }); 
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
  }
}