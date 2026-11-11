import { EntidadNoEncontradaError, PermisoDenegadoError } from '../errores/index.js'; 

export class ConfirmarCheckin {
  constructor({ unidadDeTrabajo, reloj }) {        
    this.unidadDeTrabajo = unidadDeTrabajo;        
    this.reloj = reloj;                            
  }

  async ejecutar({ torneoId, equipoId, usuarioSolicitanteId }) { 
    return this.unidadDeTrabajo.ejecutar(async ({ torneos, equipos, inscripciones }) => { 
      const torneo = await torneos.obtenerPorIdConBloqueo(torneoId); 
      if (!torneo) throw new EntidadNoEncontradaError('Torneo', torneoId); 

      const equipo = await equipos.obtenerPorId(equipoId);           
      if (!equipo) throw new EntidadNoEncontradaError('Equipo', equipoId); 
      if (!equipo.esCapitan(usuarioSolicitanteId)) throw new PermisoDenegadoError(); 

      const inscripcion = await inscripciones.obtenerPorTorneoYEquipo(torneoId, equipoId); 
      if (!inscripcion) throw new EntidadNoEncontradaError('Inscripcion', equipoId);      

      torneo.validarCheckinPermitido(this.reloj.ahora()); 
      inscripcion.confirmarCheckin();                     
      await inscripciones.guardar(inscripcion);           

      return { inscripcionId: inscripcion.id, equipoId, checkinConfirmado: inscripcion.checkinConfirmado }; 
    });
  }
}