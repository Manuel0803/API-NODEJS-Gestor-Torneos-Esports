import { EntidadNoEncontradaError, ReglaDeNegocioError } from '../errores/index.js'; 
import { Partido } from '../entidades/Partido.js';                  
import { ESTADOS_INSCRIPCION } from '../entidades/Inscripcion.js';  

export class CerrarCheckinYArmarLlave {
  constructor({ unidadDeTrabajo, reloj }) {    
    this.unidadDeTrabajo = unidadDeTrabajo;    
    this.reloj = reloj;                        
  }

  async ejecutar({ torneoId }) {               
    const ahora = this.reloj.ahora();         
    return this.unidadDeTrabajo.ejecutar(async ({ torneos, inscripciones, partidos }) => { 
      const torneo = await torneos.obtenerPorIdConBloqueo(torneoId); 
      if (!torneo) throw new EntidadNoEncontradaError('Torneo', torneoId); 

      if (!torneo.checkinHaVencido(ahora)) {   
        throw new ReglaDeNegocioError('La ventana de check-in todavía no cerró', { torneoId });
      }

      const todas = await inscripciones.obtenerPorTorneo(torneoId);  
      const vigentes = todas.filter((i) => i.estado === ESTADOS_INSCRIPCION.CONFIRMADA); 
      const presentes = vigentes.filter((i) => i.checkinConfirmado);  
      const ausentes = vigentes.filter((i) => !i.checkinConfirmado); 

      torneo.iniciarTorneo({ fechaActual: ahora, cantidadConfirmados: presentes.length }); 
      const partidosGenerados = torneo
        .generarEstructuraLlave(presentes)    
        .map((datos) => new Partido(datos));  

      ausentes.forEach((i) => i.eliminarPorWO()); 
      await torneos.guardar(torneo);          
      for (const inscripcion of ausentes) {    
        await inscripciones.guardar(inscripcion);
      }
      await partidos.guardarTodos(partidosGenerados); 
      return partidosGenerados;                
    });
  }
}