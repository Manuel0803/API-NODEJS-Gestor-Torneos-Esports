import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CerrarCheckinYArmarLlave } from '../../src/dominio/casos-de-uso/CerrarCheckinYArmarLlave.js';
import { Torneo, ESTADOS_TORNEO } from '../../src/dominio/entidades/Torneo.js';
import { Inscripcion, ESTADOS_INSCRIPCION } from '../../src/dominio/entidades/Inscripcion.js';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { RelojFijo } from '../../src/infra/memoria/RelojFijo.js';
import {
  EntidadNoEncontradaError, ReglaDeNegocioError, TorneoCerradoError,
} from '../../src/dominio/errores/index.js';

async function escenario({ presentes, ausentes = 0, ahora = '2026-12-11T02:00:00Z' }) {
  const uow = new UnidadDeTrabajoMemoria();
  const reloj = new RelojFijo(ahora);
  await uow.torneos.guardar(new Torneo({
    id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 16, tamanoEquipo: 1,
    semillaSorteo: 'semilla-test',
    inscriptosActuales: presentes + ausentes,
    fechaCierreInscripcion: '2026-12-10T00:00:00Z',
    inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
  }));
  for (let i = 1; i <= presentes + ausentes; i++) {
    await uow.inscripciones.guardar(new Inscripcion({
      id: `i${i}`, torneoId: 't1', equipoId: `e${i}`, ordenInscripcion: i,
      jugadoresIds: [`j${i}`],
      checkinConfirmado: i <= presentes,
    }));
  }
  return { uow, casoDeUso: new CerrarCheckinYArmarLlave({ unidadDeTrabajo: uow, reloj }) };
}

describe('CerrarCheckinYArmarLlave', () => {
  it('arma la llave de 13 equipos con 3 byes y pone el torneo EN_CURSO', async () => {
    const { uow, casoDeUso } = await escenario({ presentes: 13 });
    const generados = await casoDeUso.ejecutar({ torneoId: 't1' });
    assert.equal(generados.length, 15);
    assert.equal(generados.filter((p) => p.esBye).length, 3);
    assert.equal((await uow.partidos.obtenerPorTorneo('t1')).length, 15);
    assert.equal((await uow.torneos.obtenerPorId('t1')).estado, ESTADOS_TORNEO.EN_CURSO);
  });

  it('elimina por W.O. a los ausentes y no los incluye en la llave', async () => {
    const { uow, casoDeUso } = await escenario({ presentes: 4, ausentes: 1 });
    await casoDeUso.ejecutar({ torneoId: 't1' });
    const ausente = await uow.inscripciones.obtenerPorTorneoYEquipo('t1', 'e5');
    assert.equal(ausente.estado, ESTADOS_INSCRIPCION.ELIMINADO_WO);
    const partidos = await uow.partidos.obtenerPorTorneo('t1');
    assert.equal(partidos.length, 3);
    assert.equal(partidos.some((p) => p.equipoAId === 'e5' || p.equipoBId === 'e5'), false);
  });

  it('rechaza si la ventana de check-in todavía no cerró', async () => {
    const { uow, casoDeUso } = await escenario({ presentes: 4, ahora: '2026-12-11T00:30:00Z' });
    await assert.rejects(() => casoDeUso.ejecutar({ torneoId: 't1' }), ReglaDeNegocioError);
    assert.equal((await uow.torneos.obtenerPorId('t1')).estado, ESTADOS_TORNEO.ABIERTO);
    assert.equal((await uow.partidos.obtenerPorTorneo('t1')).length, 0);
  });

  it('cancela el torneo y marca W.O. a los ausentes si hay menos de 2 presentes', async () => {
    const { uow, casoDeUso } = await escenario({ presentes: 1, ausentes: 2 });
    const generados = await casoDeUso.ejecutar({ torneoId: 't1' });
    assert.deepEqual(generados, []);
    assert.equal((await uow.torneos.obtenerPorId('t1')).estado, ESTADOS_TORNEO.CANCELADO);
    assert.equal((await uow.partidos.obtenerPorTorneo('t1')).length, 0);
    const ausente2 = await uow.inscripciones.obtenerPorTorneoYEquipo('t1', 'e2');
    const ausente3 = await uow.inscripciones.obtenerPorTorneoYEquipo('t1', 'e3');
    assert.equal(ausente2.estado, ESTADOS_INSCRIPCION.ELIMINADO_WO);
    assert.equal(ausente3.estado, ESTADOS_INSCRIPCION.ELIMINADO_WO);
  });

  it('no permite armar la llave dos veces', async () => {
    const { uow, casoDeUso } = await escenario({ presentes: 4 });
    await casoDeUso.ejecutar({ torneoId: 't1' });
    await assert.rejects(() => casoDeUso.ejecutar({ torneoId: 't1' }), TorneoCerradoError);
    assert.equal((await uow.partidos.obtenerPorTorneo('t1')).length, 3);
  });

  it('falla si el torneo no existe', async () => {
    const { casoDeUso } = await escenario({ presentes: 4 });
    await assert.rejects(() => casoDeUso.ejecutar({ torneoId: 'no-existe' }), EntidadNoEncontradaError);
  });
});
