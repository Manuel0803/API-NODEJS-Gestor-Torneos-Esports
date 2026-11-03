import { EntidadNoEncontradaError, TorneoCerradoError } from '../errores/index.js'; 
import { ESTADOS_TORNEO } from '../entidades/Torneo.js';                            

export class AnularPartido {
  constructor({ unidadDeTrabajo, reloj }) {
    this.unidadDeTrabajo = unidadDeTrabajo;        
    this.reloj = reloj;                            
  }

  async ejecutar({ partidoId, arbitroId, motivo, resolucion, nuevoGanadorId }) { 
    return this.unidadDeTrabajo.ejecutar(async ({ partidos, torneos, auditoria }) => { 
      const partido = await partidos.obtenerPorIdConBloqueo(partidoId); 
      if (!partido) throw new EntidadNoEncontradaError('Partido', partidoId); 

      const respuestaDominio = partido.anularPorArbitro({ 
        arbitroId,
        motivo,
        resolucion,
        ganadorId: nuevoGanadorId,
      });

      await auditoria.guardar({                    
        partidoId: partido.id,
        arbitroId,
        accion: 'ANULACION_CASCADA',
        motivo,
        estadoAnterior: respuestaDominio.estadoAnterior,
        fecha: this.reloj.ahora(),
      });

      if (respuestaDominio.debeRevertirSiguiente && respuestaDominio.siguientePartidoId) { 
        let actualId = respuestaDominio.siguientePartidoId;
        let slot = respuestaDominio.slotSiguiente;

        while (actualId) {                         
          const siguientePartido = await partidos.obtenerPorIdConBloqueo(actualId); 
          if (!siguientePartido) throw new EntidadNoEncontradaError('Partido', actualId); 

          const reversion = siguientePartido.revertirSlot(slot); 
          await partidos.guardar(siguientePartido);

          if (!reversion.debeRevertirSiguientes) break; 
          actualId = reversion.siguientePartidoId;      
          slot = reversion.slotSiguiente;
        }
      }

      if (respuestaDominio.avanza && respuestaDominio.siguientePartidoId) { 
        const siguientePartido = await partidos.obtenerPorIdConBloqueo(respuestaDominio.siguientePartidoId);
        if (!siguientePartido) {
          throw new EntidadNoEncontradaError('Partido', respuestaDominio.siguientePartidoId);
        }
        siguientePartido.asignarEquipo(respuestaDominio.slotSiguiente, respuestaDominio.ganadorId);
        await partidos.guardar(siguientePartido);
      }

      const torneo = await torneos.obtenerPorIdConBloqueo(partido.torneoId); 
      if (!torneo) throw new EntidadNoEncontradaError('Torneo', partido.torneoId); 
      if (torneo.estado === ESTADOS_TORNEO.FINALIZADO) {   
        throw new TorneoCerradoError('El torneo ya finalizó: no se pueden anular partidos'); 
      }

      await partidos.guardar(partido);             
      return respuestaDominio;
    });
  }
}