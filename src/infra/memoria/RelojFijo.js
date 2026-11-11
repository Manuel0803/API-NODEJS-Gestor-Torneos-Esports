export class RelojFijo {                       
  constructor(fecha) {                        
    this.fecha = new Date(fecha);              
  }
  ahora() {                                    
    return new Date(this.fecha);               
  }
  avanzar(milisegundos) {                      
    this.fecha = new Date(this.fecha.getTime() + milisegundos); 
  }
}