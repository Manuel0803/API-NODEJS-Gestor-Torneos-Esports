import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResolverDisputa } from '../../src/dominio/casos-de-uso/ResolverDisputa.js';
import { ESTADOS_PARTIDO, RESULTADOS_REPORTE } from '../../src/dominio/entidades/Partido.js';
import { ESTADOS_TORNEO } from '../../src/dominio/entidades/Torneo.js';
import {
  EntidadNoEncontradaError, PartidoNoModificableError, ReporteInvalidoError, ReglaDeNegocioError,
} from '../../src/dominio/errores/index.js';
import { crearEscenario, guardarPartido } from './ayudas/escenarioLlave.js';

const enDisputa = {                                
  estado: ESTADOS_PARTIDO.EN_DISPUTA,
  reporteEquipoA: RESULTADOS_REPORTE.GANA_A,
  reporteEquipoB: RESULTADOS_REPORTE.GANA_B,
};

async function preparar() {                        
  const { uow, reloj } = await crearEscenario();
  await guardarPartido(uow, { id: 'p1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', ...enDisputa, siguientePartidoId: 'pf', slotSiguiente: 'A' });
  await guardarPartido(uow, { id: 'pf', ronda: 2, posicionEnRonda: 1 });
  return { uow, reloj, casoDeUso: new ResolverDisputa({ unidadDeTrabajo: uow, reloj }) };
}

describe('ResolverDisputa', () => {
  it('confirma al ganador elegido y lo hace avanzar a la ronda siguiente', async () => {
    const { uow, casoDeUso } = await preparar();
    await casoDeUso.ejecutar({ partidoId: 'p1', arbitroId: 'a1', ganadorId: 'e1', motivo: 'Revisión de VOD' });
    const p1 = await uow.partidos.obtenerPorId('p1');
    assert.equal(p1.estado, ESTADOS_PARTIDO.CONFIRMADO);
    assert.equal(p1.ganadorId, 'e1');
    assert.equal((await uow.partidos.obtenerPorId('pf')).equipoAId, 'e1'); 
  });

  it('registra la auditoría con el estado anterior completo', async () => {
    const { uow, reloj, casoDeUso } = await preparar();
    await casoDeUso.ejecutar({ partidoId: 'p1', arbitroId: 'a1', ganadorId: 'e1', motivo: 'Revisión de VOD' });
    const registros = await uow.auditoria.obtenerPorPartido('p1');
    assert.equal(registros.length, 1);
    assert.equal(registros[0].accion, 'RESOLUCION_DISPUTA');
    assert.equal(registros[0].arbitroId, 'a1');
    assert.equal(registros[0].estadoAnterior.estado, ESTADOS_PARTIDO.EN_DISPUTA);
    assert.equal(registros[0].estadoAnterior.reporteEquipoA, RESULTADOS_REPORTE.GANA_A);
    assert.equal(registros[0].estadoAnterior.ganadorId, null);   
    assert.deepEqual(registros[0].fecha, reloj.ahora());         
  });

  it('rechaza si el partido no está en disputa y no deja rastro', async () => {
    const { uow, casoDeUso } = await preparar();
    await guardarPartido(uow, { id: 'p2', ronda: 1, posicionEnRonda: 2, equipoAId: 'e3', equipoBId: 'e4', estado: ESTADOS_PARTIDO.EN_JUEGO });
    await assert.rejects(
      () => casoDeUso.ejecutar({ partidoId: 'p2', arbitroId: 'a1', ganadorId: 'e3', motivo: 'x' }),
      PartidoNoModificableError,
    );
    assert.equal((await uow.auditoria.obtenerPorPartido('p2')).length, 0);
  });

  it('rechaza un ganador que no juega ese partido', async () => {
    const { casoDeUso } = await preparar();
    await assert.rejects(
      () => casoDeUso.ejecutar({ partidoId: 'p1', arbitroId: 'a1', ganadorId: 'e3', motivo: 'x' }),
      ReporteInvalidoError,
    );
  });

  it('rechaza una resolución sin motivo', async () => {
    const { casoDeUso } = await preparar();
    await assert.rejects(
      () => casoDeUso.ejecutar({ partidoId: 'p1', arbitroId: 'a1', ganadorId: 'e1', motivo: '' }),
      ReglaDeNegocioError,
    );
  });

  it('rechaza un partido inexistente', async () => {
    const { casoDeUso } = await preparar();
    await assert.rejects(
      () => casoDeUso.ejecutar({ partidoId: 'no-existe', arbitroId: 'a1', ganadorId: 'e1', motivo: 'x' }),
      EntidadNoEncontradaError,
    );
  });

  it('hace rollback si falta la ronda siguiente: el partido sigue en disputa y sin auditoría', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'p1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', ...enDisputa, siguientePartidoId: 'fantasma', slotSiguiente: 'A' }); 
    const casoDeUso = new ResolverDisputa({ unidadDeTrabajo: uow, reloj });
    await assert.rejects(
      () => casoDeUso.ejecutar({ partidoId: 'p1', arbitroId: 'a1', ganadorId: 'e1', motivo: 'x' }),
      EntidadNoEncontradaError,
    );
    assert.equal((await uow.partidos.obtenerPorId('p1')).estado, ESTADOS_PARTIDO.EN_DISPUTA); 
    assert.equal((await uow.auditoria.obtenerPorPartido('p1')).length, 0);
  });

  it('al resolver la final, el torneo pasa a FINALIZADO', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'pf', ronda: 2, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e3', ...enDisputa }); 
    const casoDeUso = new ResolverDisputa({ unidadDeTrabajo: uow, reloj });
    await casoDeUso.ejecutar({ partidoId: 'pf', arbitroId: 'a1', ganadorId: 'e3', motivo: 'Revisión de VOD' });
    assert.equal((await uow.torneos.obtenerPorId('t1')).estado, ESTADOS_TORNEO.FINALIZADO);
  });
});