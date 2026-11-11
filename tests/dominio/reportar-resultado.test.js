import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReportarResultado } from '../../src/dominio/casos-de-uso/ReportarResultado.js';
import { Torneo, ESTADOS_TORNEO } from '../../src/dominio/entidades/Torneo.js';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { Partido, ESTADOS_PARTIDO, RESULTADOS_REPORTE } from '../../src/dominio/entidades/Partido.js';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import {
  EntidadNoEncontradaError, PermisoDenegadoError, ReporteInvalidoError, PartidoNoModificableError,
} from '../../src/dominio/errores/index.js';

async function escenario() {                                  
  const uow = new UnidadDeTrabajoMemoria();                   
  await uow.torneos.guardar(new Torneo({                      
    id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 4, inscriptosActuales: 4, tamanoEquipo: 1,
    semillaSorteo: 'semilla-test',
    fechaCierreInscripcion: '2026-12-10T00:00:00Z',
    inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
    estado: ESTADOS_TORNEO.EN_CURSO,
  }));
  for (const n of [1, 2, 3, 4]) {                             
    await uow.equipos.guardar(new Equipo({ id: `e${n}`, nombre: `Equipo ${n}`, capitanId: `u${n}` }));
  }
  const base = { torneoId: 't1', estado: ESTADOS_PARTIDO.EN_JUEGO, siguientePartidoId: 'pf' }; 
  await uow.partidos.guardar(new Partido({ ...base, id: 'p1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', slotSiguiente: 'A' })); 
  await uow.partidos.guardar(new Partido({ ...base, id: 'p2', ronda: 1, posicionEnRonda: 2, equipoAId: 'e3', equipoBId: 'e4', slotSiguiente: 'B' })); 
  await uow.partidos.guardar(new Partido({ id: 'pf', torneoId: 't1', ronda: 2, posicionEnRonda: 1 })); 
  return { uow, casoDeUso: new ReportarResultado({ unidadDeTrabajo: uow }) };
}

const reportar = (casoDeUso, partidoId, equipoId, usuarioSolicitanteId, resultado) =>
  casoDeUso.ejecutar({ partidoId, equipoId, resultado, usuarioSolicitanteId }); 

async function confirmar(casoDeUso, partidoId, equipoA, equipoB) { 
  await reportar(casoDeUso, partidoId, equipoA, `u${equipoA.slice(1)}`, RESULTADOS_REPORTE.GANA_A);
  await reportar(casoDeUso, partidoId, equipoB, `u${equipoB.slice(1)}`, RESULTADOS_REPORTE.GANA_A);
}

describe('ReportarResultado', () => {
  it('con un solo reporte el partido sigue EN_JUEGO y nadie avanza', async () => {
    const { uow, casoDeUso } = await escenario();
    const res = await reportar(casoDeUso, 'p1', 'e1', 'u1', RESULTADOS_REPORTE.GANA_A);
    assert.equal(res.estado, ESTADOS_PARTIDO.EN_JUEGO);       
    assert.equal((await uow.partidos.obtenerPorId('pf')).equipoAId, null); 
  });

  it('con dos reportes coincidentes confirma el partido y avanza al ganador', async () => {
    const { uow, casoDeUso } = await escenario();
    await confirmar(casoDeUso, 'p1', 'e1', 'e2');
    const p1 = await uow.partidos.obtenerPorId('p1');
    assert.equal(p1.estado, ESTADOS_PARTIDO.CONFIRMADO);
    assert.equal(p1.ganadorId, 'e1');
    const pf = await uow.partidos.obtenerPorId('pf');
    assert.equal(pf.equipoAId, 'e1');                         
    assert.equal(pf.estado, ESTADOS_PARTIDO.PENDIENTE);      
  });

  it('cuando se confirman las dos semifinales la final pasa a EN_JUEGO', async () => {
    const { uow, casoDeUso } = await escenario();
    await confirmar(casoDeUso, 'p1', 'e1', 'e2');
    await confirmar(casoDeUso, 'p2', 'e3', 'e4');
    const pf = await uow.partidos.obtenerPorId('pf');
    assert.equal(pf.equipoAId, 'e1');
    assert.equal(pf.equipoBId, 'e3');
    assert.equal(pf.estado, ESTADOS_PARTIDO.EN_JUEGO);       
  });

  it('con reportes contradictorios pasa a EN_DISPUTA y no avanza nadie', async () => {
    const { uow, casoDeUso } = await escenario();
    await reportar(casoDeUso, 'p1', 'e1', 'u1', RESULTADOS_REPORTE.GANA_A);
    const res = await reportar(casoDeUso, 'p1', 'e2', 'u2', RESULTADOS_REPORTE.GANA_B); 
    assert.equal(res.estado, ESTADOS_PARTIDO.EN_DISPUTA);
    assert.equal(res.ganadorId, null);
    assert.equal(res.enDisputa, true);
    assert.equal((await uow.partidos.obtenerPorId('pf')).equipoAId, null); 
  });

  it('rechaza si quien reporta no es el capitán del equipo (IDOR)', async () => {
    const { casoDeUso } = await escenario();
    await assert.rejects(
      () => reportar(casoDeUso, 'p1', 'e1', 'u2', RESULTADOS_REPORTE.GANA_A), 
      PermisoDenegadoError,
    );
  });

  it('rechaza un equipo que no juega ese partido', async () => {
    const { casoDeUso } = await escenario();
    await assert.rejects(
      () => reportar(casoDeUso, 'p1', 'e3', 'u3', RESULTADOS_REPORTE.GANA_A), 
      ReporteInvalidoError,
    );
  });

  it('rechaza reportar en un partido que no existe', async () => {
    const { casoDeUso } = await escenario();
    await assert.rejects(
      () => reportar(casoDeUso, 'no-existe', 'e1', 'u1', RESULTADOS_REPORTE.GANA_A),
      EntidadNoEncontradaError,
    );
  });

  it('rechaza reportar en un partido ya confirmado', async () => {
    const { casoDeUso } = await escenario();
    await confirmar(casoDeUso, 'p1', 'e1', 'e2');
    await assert.rejects(
      () => reportar(casoDeUso, 'p1', 'e1', 'u1', RESULTADOS_REPORTE.GANA_B), 
      PartidoNoModificableError,
    );
  });

  it('al confirmarse la final el torneo pasa a FINALIZADO', async () => {
    const { uow, casoDeUso } = await escenario();
    await confirmar(casoDeUso, 'p1', 'e1', 'e2');
    await confirmar(casoDeUso, 'p2', 'e3', 'e4');
    await confirmar(casoDeUso, 'pf', 'e1', 'e3');             
    const torneo = await uow.torneos.obtenerPorId('t1');
    assert.equal(torneo.estado, ESTADOS_TORNEO.FINALIZADO);
    assert.equal((await uow.partidos.obtenerPorId('pf')).ganadorId, 'e1');
  });
});