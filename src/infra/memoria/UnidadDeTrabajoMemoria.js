import { Torneo } from '../../dominio/entidades/Torneo.js';
import { Equipo } from '../../dominio/entidades/Equipo.js';
import { Inscripcion } from '../../dominio/entidades/Inscripcion.js';
import { Partido } from '../../dominio/entidades/Partido.js';       

class RepoMemoria {                            
  constructor(Entidad) {                       
    this.Entidad = Entidad;                    
    this.datos = new Map();                    
  }
  copiar(entidad) {                           
    return new this.Entidad({ ...entidad });   
  }
  async guardar(entidad) {                    
    this.datos.set(entidad.id, this.copiar(entidad)); 
  }
  async obtenerPorId(id) {                     
    const guardada = this.datos.get(id);       
    return guardada ? this.copiar(guardada) : null;
  }
}

class RepoTorneoMemoria extends RepoMemoria {
  constructor() { super(Torneo); }             
  async obtenerPorIdConBloqueo(id) {           
    return this.obtenerPorId(id);              
  }
}

class RepoEquipoMemoria extends RepoMemoria {
  constructor() { super(Equipo); }             
}

class RepoInscripcionMemoria extends RepoMemoria {
  constructor() { super(Inscripcion); }        
  async obtenerPorTorneoYEquipo(torneoId, equipoId) { 
    const todas = [...this.datos.values()];   
    const encontrada = todas.find((i) => i.torneoId === torneoId && i.equipoId === equipoId); 
    return encontrada ? this.copiar(encontrada) : null; 
  }
  async jugadorYaInscriptoEnTorneo(torneoId, jugadorId) { 
    return [...this.datos.values()].some(     
      (i) => i.torneoId === torneoId && i.contieneJugador(jugadorId),
    );
  }
  async obtenerPorTorneo(torneoId) {           
    return [...this.datos.values()]            
      .filter((i) => i.torneoId === torneoId)  
      .map((i) => this.copiar(i));             
  }
}

class RepoPartidoMemoria extends RepoMemoria {
  constructor() { super(Partido); }            
  async guardarTodos(partidos) {               
    for (const partido of partidos) {         
      await this.guardar(partido);            
    }
  }
  async obtenerPorTorneo(torneoId) {          
    return [...this.datos.values()]
      .filter((p) => p.torneoId === torneoId)  
      .map((p) => this.copiar(p));             
  }
  async obtenerPorIdConBloqueo(id) {           
    return this.obtenerPorId(id);
  }
}

export class UnidadDeTrabajoMemoria {          
  constructor() {
    this.torneos = new RepoTorneoMemoria();    
    this.equipos = new RepoEquipoMemoria();
    this.inscripciones = new RepoInscripcionMemoria();
    this.partidos = new RepoPartidoMemoria();  
  }
  async ejecutar(trabajo) {                    
    const repos = [this.torneos, this.equipos, this.inscripciones, this.partidos];
    const respaldo = repos.map((r) => new Map(r.datos)); 
    try {
      return await trabajo({                  
        torneos: this.torneos,
        equipos: this.equipos,
        inscripciones: this.inscripciones,
        partidos: this.partidos,              
      });
    } catch (error) {
      repos.forEach((r, i) => { r.datos = respaldo[i]; }); 
      throw error;                             
    }
  }
}