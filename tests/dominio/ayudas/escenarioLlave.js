import { Torneo, ESTADOS_TORNEO } from '../../../src/dominio/entidades/Torneo.js';
import { Equipo } from '../../../src/dominio/entidades/Equipo.js';
import { Partido } from '../../../src/dominio/entidades/Partido.js';
import { UnidadDeTrabajoMemoria } from '../../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { RelojFijo } from '../../../src/infra/memoria/RelojFijo.js';

export async function crearEscenario({ estadoTorneo = ESTADOS_TORNEO.EN_CURSO } = {}) { 
  const uow = new UnidadDeTrabajoMemoria();        
  const reloj = new RelojFijo('2026-12-12T12:00:00Z'); 
  await uow.torneos.guardar(new Torneo({           
    id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 8, inscriptosActuales: 5, tamanoEquipo: 1,
    semillaSorteo: 'semilla-test',
    fechaCierreInscripcion: '2026-12-10T00:00:00Z',
    inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
    estado: estadoTorneo,
  }));
  for (const n of [1, 2, 3, 4, 5]) {               
    await uow.equipos.guardar(new Equipo({ id: `e${n}`, nombre: `Equipo ${n}`, capitanId: `u${n}` }));
  }
  return { uow, reloj };
}

export const guardarPartido = (uow, datos) =>      
  uow.partidos.guardar(new Partido({ torneoId: 't1', ...datos }));