import { randomUUID } from 'node:crypto';          
import { Torneo } from '../entidades/Torneo.js';   

export class CrearTorneo {
  constructor({ unidadDeTrabajo }) {               
    this.unidadDeTrabajo = unidadDeTrabajo;        
  }

  async ejecutar({ nombre, juego, cupoMaximo, tamanoEquipo, fechaCierreInscripcion, inicioCheckin, finCheckin, semillaSorteo, formato }) {
    const torneo = new Torneo({                    
      id: randomUUID(),
      nombre, juego, cupoMaximo, tamanoEquipo,
      fechaCierreInscripcion, inicioCheckin, finCheckin,
      semillaSorteo, formato,                      
    });
    await this.unidadDeTrabajo.ejecutar(async ({ torneos }) => { 
      await torneos.guardar(torneo);               
    });
    return torneo;                                 
  }
}