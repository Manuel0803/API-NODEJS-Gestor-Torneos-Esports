import { describe, it } from 'node:test';                   
import assert from 'node:assert/strict';                     
import { InscribirEquipo } from '../../src/dominio/casos-de-uso/InscribirEquipo.js'; 
import { Torneo } from '../../src/dominio/entidades/Torneo.js';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { RelojFijo } from '../../src/infra/memoria/RelojFijo.js';
import {
  CupoAgotadoError, TorneoCerradoError, JugadorYaInscriptoError, PermisoDenegadoError,
} from '../../src/dominio/errores/index.js';

async function escenario({ cupoMaximo = 2, ahora = '2026-12-01T12:00:00Z' } = {}) { 
  const uow = new UnidadDeTrabajoMemoria();                  
  const reloj = new RelojFijo(ahora);                         
  await uow.torneos.guardar(new Torneo({                      
    id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo, tamanoEquipo: 2,
    semillaSorteo: 'semilla-test',
    fechaCierreInscripcion: '2026-12-10T00:00:00Z',           
    inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
  }));
  await uow.equipos.guardar(new Equipo({ id: 'e1', nombre: 'Equipo Uno', capitanId: 'u1' })); 
  await uow.equipos.guardar(new Equipo({ id: 'e2', nombre: 'Equipo Dos', capitanId: 'u2' })); 
  const casoDeUso = new InscribirEquipo({ unidadDeTrabajo: uow, reloj }); 
  return { uow, reloj, casoDeUso };                          
}

describe('InscribirEquipo', () => {
  it('inscribe un equipo válido y suma uno al contador', async () => {
    const { uow, casoDeUso } = await escenario();            
    const insc = await casoDeUso.ejecutar({                  
      torneoId: 't1', equipoId: 'e1', jugadoresIds: ['j1', 'j2'], usuarioSolicitanteId: 'u1',
    });
    assert.equal(insc.ordenInscripcion, 1);                   
    const torneo = await uow.torneos.obtenerPorId('t1');      
    assert.equal(torneo.inscriptosActuales, 1);               
  });

  it('rechaza cuando el cupo está agotado y no deja cambios', async () => {
    const { uow, casoDeUso } = await escenario({ cupoMaximo: 2 }); 
    await casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e1', jugadoresIds: ['j1', 'j2'], usuarioSolicitanteId: 'u1' }); 
    await uow.equipos.guardar(new Equipo({ id: 'e3', nombre: 'Equipo Tres', capitanId: 'u3' })); 
    await casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e2', jugadoresIds: ['j3', 'j4'], usuarioSolicitanteId: 'u2' }); 
    await assert.rejects(                                    
      () => casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e3', jugadoresIds: ['j5', 'j6'], usuarioSolicitanteId: 'u3' }),
      CupoAgotadoError,                                      
    );
    const torneo = await uow.torneos.obtenerPorId('t1');     
    assert.equal(torneo.inscriptosActuales, 2);             
  });

  it('rechaza si el plazo de inscripción venció', async () => {
    const { casoDeUso } = await escenario({ ahora: '2026-12-20T00:00:00Z' }); 
    await assert.rejects(
      () => casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e1', jugadoresIds: ['j1', 'j2'], usuarioSolicitanteId: 'u1' }),
      TorneoCerradoError,
    );
  });

  it('rechaza un jugador que ya está en otro equipo del torneo', async () => {
    const { casoDeUso } = await escenario();
    await casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e1', jugadoresIds: ['j1', 'j2'], usuarioSolicitanteId: 'u1' }); 
    await assert.rejects(
      () => casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e2', jugadoresIds: ['j2', 'j3'], usuarioSolicitanteId: 'u2' }), 
      JugadorYaInscriptoError,
    );
  });

  it('rechaza si quien pide no es el capitán del equipo (IDOR)', async () => {
    const { casoDeUso } = await escenario();
    await assert.rejects(
      () => casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e1', jugadoresIds: ['j1', 'j2'], usuarioSolicitanteId: 'u2' }), 
      PermisoDenegadoError,
    );
  });
});