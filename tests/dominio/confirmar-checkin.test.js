import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmarCheckin } from '../../src/dominio/casos-de-uso/ConfirmarCheckin.js';
import { Torneo, ESTADOS_TORNEO } from '../../src/dominio/entidades/Torneo.js';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { Inscripcion, ESTADOS_INSCRIPCION } from '../../src/dominio/entidades/Inscripcion.js';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { RelojFijo } from '../../src/infra/memoria/RelojFijo.js';
import {
  EntidadNoEncontradaError, PermisoDenegadoError, CheckinFueraDeVentanaError,
  TorneoCerradoError, ReglaDeNegocioError,
} from '../../src/dominio/errores/index.js';

async function escenario({ ahora = '2026-12-11T00:30:00Z', estado = ESTADOS_TORNEO.ABIERTO, estadoInscripcion } = {}) {
  const uow = new UnidadDeTrabajoMemoria();        
  const reloj = new RelojFijo(ahora);              
  await uow.torneos.guardar(new Torneo({
    id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 8, inscriptosActuales: 1, tamanoEquipo: 1,
    semillaSorteo: 'semilla-test',
    fechaCierreInscripcion: '2026-12-10T00:00:00Z',
    inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
    estado,
  }));
  await uow.equipos.guardar(new Equipo({ id: 'e1', nombre: 'Equipo Uno', capitanId: 'u1' })); 
  await uow.equipos.guardar(new Equipo({ id: 'e2', nombre: 'Equipo Dos', capitanId: 'u2' })); 
  await uow.inscripciones.guardar(new Inscripcion({
    id: 'i1', torneoId: 't1', equipoId: 'e1', ordenInscripcion: 1, jugadoresIds: ['j1'],
    ...(estadoInscripcion ? { estado: estadoInscripcion } : {}),
  }));
  return { uow, casoDeUso: new ConfirmarCheckin({ unidadDeTrabajo: uow, reloj }) };
}

const pedido = { torneoId: 't1', equipoId: 'e1', usuarioSolicitanteId: 'u1' }; 

describe('ConfirmarCheckin', () => {
  it('confirma la presencia dentro de la ventana', async () => {
    const { uow, casoDeUso } = await escenario();
    const res = await casoDeUso.ejecutar(pedido);
    assert.equal(res.checkinConfirmado, true);
    assert.equal((await uow.inscripciones.obtenerPorTorneoYEquipo('t1', 'e1')).checkinConfirmado, true); 
  });

  it('es idempotente: confirmar dos veces deja el mismo resultado', async () => {
    const { casoDeUso } = await escenario();
    await casoDeUso.ejecutar(pedido);
    const segunda = await casoDeUso.ejecutar(pedido); 
    assert.equal(segunda.checkinConfirmado, true);
  });

  it('rechaza antes de que abra la ventana', async () => {
    const { casoDeUso } = await escenario({ ahora: '2026-12-10T23:00:00Z' });
    await assert.rejects(() => casoDeUso.ejecutar(pedido), CheckinFueraDeVentanaError);
  });

  it('rechaza después de que cierre la ventana', async () => {
    const { casoDeUso } = await escenario({ ahora: '2026-12-11T02:00:00Z' });
    await assert.rejects(() => casoDeUso.ejecutar(pedido), CheckinFueraDeVentanaError);
  });

  it('rechaza si el torneo ya está en curso', async () => {
    const { casoDeUso } = await escenario({ estado: ESTADOS_TORNEO.EN_CURSO }); 
    await assert.rejects(() => casoDeUso.ejecutar(pedido), TorneoCerradoError);
  });

  it('rechaza si quien pide no es el capitán del equipo (IDOR)', async () => {
    const { uow, casoDeUso } = await escenario();
    await assert.rejects(() => casoDeUso.ejecutar({ ...pedido, usuarioSolicitanteId: 'u2' }), PermisoDenegadoError);
    assert.equal((await uow.inscripciones.obtenerPorTorneoYEquipo('t1', 'e1')).checkinConfirmado, false); 
  });

  it('rechaza a un equipo que no está inscripto en el torneo', async () => {
    const { casoDeUso } = await escenario();
    await assert.rejects(
      () => casoDeUso.ejecutar({ torneoId: 't1', equipoId: 'e2', usuarioSolicitanteId: 'u2' }), 
      EntidadNoEncontradaError,
    );
  });

  it('rechaza a un equipo ya eliminado por W.O.', async () => {
    const { casoDeUso } = await escenario({ estadoInscripcion: ESTADOS_INSCRIPCION.ELIMINADO_WO });
    await assert.rejects(() => casoDeUso.ejecutar(pedido), ReglaDeNegocioError);
  });

  it('falla si el torneo no existe', async () => {
    const { casoDeUso } = await escenario();
    await assert.rejects(() => casoDeUso.ejecutar({ ...pedido, torneoId: 'no-existe' }), EntidadNoEncontradaError);
  });
});