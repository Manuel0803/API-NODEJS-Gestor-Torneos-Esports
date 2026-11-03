import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnularPartido } from '../../src/dominio/casos-de-uso/AnularPartido.js';
import { ESTADOS_PARTIDO, RESULTADOS_REPORTE, RESOLUCIONES_ANULACION } from '../../src/dominio/entidades/Partido.js';
import { ESTADOS_TORNEO } from '../../src/dominio/entidades/Torneo.js';
import {
  ErrorDeDominio, EntidadNoEncontradaError, PartidoNoModificableError, TorneoCerradoError,
} from '../../src/dominio/errores/index.js';
import { crearEscenario, guardarPartido } from './ayudas/escenarioLlave.js';

const confirmadoPorA = {                           
  estado: ESTADOS_PARTIDO.CONFIRMADO,
  reporteEquipoA: RESULTADOS_REPORTE.GANA_A,
  reporteEquipoB: RESULTADOS_REPORTE.GANA_A,
};

const anulacion = { partidoId: 'r1', arbitroId: 'a1', motivo: 'Software no permitido', resolucion: RESOLUCIONES_ANULACION.REJUGAR };

describe('AnularPartido', () => {
  it('REJUGAR reabre el partido y revierte la llave en dos niveles', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'r1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', ...confirmadoPorA, ganadorId: 'e1', siguientePartidoId: 'r2', slotSiguiente: 'A' });
    await guardarPartido(uow, { id: 'r2', ronda: 2, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e3', ...confirmadoPorA, ganadorId: 'e1', siguientePartidoId: 'r3', slotSiguiente: 'A' }); 
    await guardarPartido(uow, { id: 'r3', ronda: 3, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e5', estado: ESTADOS_PARTIDO.EN_JUEGO });                                       
    await new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar(anulacion);

    const r1 = await uow.partidos.obtenerPorId('r1');
    const r2 = await uow.partidos.obtenerPorId('r2');
    const r3 = await uow.partidos.obtenerPorId('r3');
    assert.equal(r1.estado, ESTADOS_PARTIDO.EN_JUEGO);   
    assert.equal(r1.ganadorId, null);
    assert.equal(r2.estado, ESTADOS_PARTIDO.PENDIENTE);  
    assert.equal(r2.equipoAId, null);
    assert.equal(r2.equipoBId, 'e3');                    
    assert.equal(r3.estado, ESTADOS_PARTIDO.PENDIENTE);  
    assert.equal(r3.equipoAId, null);
    assert.equal(r3.equipoBId, 'e5');                    
  });

  it('registra la auditoría con el estado anterior', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'r1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', ...confirmadoPorA, ganadorId: 'e1' });
    await new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar(anulacion);
    const registros = await uow.auditoria.obtenerPorPartido('r1');
    assert.equal(registros.length, 1);
    assert.equal(registros[0].accion, 'ANULACION_CASCADA');
    assert.equal(registros[0].motivo, 'Software no permitido');
    assert.equal(registros[0].estadoAnterior.estado, ESTADOS_PARTIDO.CONFIRMADO);
    assert.equal(registros[0].estadoAnterior.ganadorId, 'e1'); 
    assert.deepEqual(registros[0].fecha, reloj.ahora());
  });

  it('VICTORIA_ADMINISTRATIVA cambia el ganador y hace avanzar al nuevo', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'r1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', ...confirmadoPorA, ganadorId: 'e1', siguientePartidoId: 'r2', slotSiguiente: 'A' });
    await guardarPartido(uow, { id: 'r2', ronda: 2, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e3', estado: ESTADOS_PARTIDO.EN_JUEGO }); 
    await new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar({
      ...anulacion, resolucion: RESOLUCIONES_ANULACION.VICTORIA_ADMINISTRATIVA, nuevoGanadorId: 'e2',
    });
    const r1 = await uow.partidos.obtenerPorId('r1');
    const r2 = await uow.partidos.obtenerPorId('r2');
    assert.equal(r1.estado, ESTADOS_PARTIDO.CONFIRMADO);
    assert.equal(r1.ganadorId, 'e2');                    
    assert.equal(r2.equipoAId, 'e2');                    
    assert.equal(r2.equipoBId, 'e3');
    assert.equal(r2.estado, ESTADOS_PARTIDO.EN_JUEGO);   
  });

  it('anular un partido en disputa lo reabre sin tocar la llave', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'r1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', estado: ESTADOS_PARTIDO.EN_DISPUTA, reporteEquipoA: RESULTADOS_REPORTE.GANA_A, reporteEquipoB: RESULTADOS_REPORTE.GANA_B, siguientePartidoId: 'r2', slotSiguiente: 'A' });
    await guardarPartido(uow, { id: 'r2', ronda: 2, posicionEnRonda: 1 });
    await new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar(anulacion);
    const r1 = await uow.partidos.obtenerPorId('r1');
    assert.equal(r1.estado, ESTADOS_PARTIDO.EN_JUEGO);
    assert.equal(r1.reporteEquipoA, null);               
    assert.equal((await uow.partidos.obtenerPorId('r2')).estado, ESTADOS_PARTIDO.PENDIENTE); 
  });

  it('hace rollback si falta un partido de la cascada: no queda auditoría ni cambios', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'r1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', ...confirmadoPorA, ganadorId: 'e1', siguientePartidoId: 'fantasma', slotSiguiente: 'A' }); 
    await assert.rejects(
      () => new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar(anulacion),
      EntidadNoEncontradaError,
    );
    const r1 = await uow.partidos.obtenerPorId('r1');
    assert.equal(r1.estado, ESTADOS_PARTIDO.CONFIRMADO); 
    assert.equal(r1.ganadorId, 'e1');
    assert.equal((await uow.auditoria.obtenerPorPartido('r1')).length, 0); 
  });

  it('rechaza anular partidos de un torneo ya FINALIZADO', async () => {
    const { uow, reloj } = await crearEscenario({ estadoTorneo: ESTADOS_TORNEO.FINALIZADO });
    await guardarPartido(uow, { id: 'r1', ronda: 2, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e3', ...confirmadoPorA, ganadorId: 'e1' }); 
    await assert.rejects(
      () => new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar(anulacion),
      TorneoCerradoError,
    );
    assert.equal((await uow.partidos.obtenerPorId('r1')).estado, ESTADOS_PARTIDO.CONFIRMADO); 
    assert.equal((await uow.auditoria.obtenerPorPartido('r1')).length, 0);
  });

  it('rechaza anular un partido que no existe', async () => {
    const { uow, reloj } = await crearEscenario();
    await assert.rejects(
      () => new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar({ ...anulacion, partidoId: 'no-existe' }),
      EntidadNoEncontradaError,
    );
  });

  it('rechaza anular un partido que todavía se está jugando', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'r1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', estado: ESTADOS_PARTIDO.EN_JUEGO });
    await assert.rejects(
      () => new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar(anulacion),
      PartidoNoModificableError,
    );
  });

  it('rechaza una anulación sin resolución válida', async () => {
    const { uow, reloj } = await crearEscenario();
    await guardarPartido(uow, { id: 'r1', ronda: 1, posicionEnRonda: 1, equipoAId: 'e1', equipoBId: 'e2', ...confirmadoPorA, ganadorId: 'e1' });
    await assert.rejects(
      () => new AnularPartido({ unidadDeTrabajo: uow, reloj }).ejecutar({ ...anulacion, resolucion: undefined }),
      ErrorDeDominio,
    );
  });
});