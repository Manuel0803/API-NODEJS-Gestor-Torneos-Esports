import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CrearTorneo } from '../../src/dominio/casos-de-uso/CrearTorneo.js';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';

const base = {
  juego: 'LoL', cupoMaximo: 8, tamanoEquipo: 2, semillaSorteo: 'semilla-test',
  fechaCierreInscripcion: '2026-12-10T00:00:00Z',
  inicioCheckin: '2026-12-11T00:00:00Z',
};

describe('obtenerAbiertosConCheckinVencido', () => {
  it('devuelve solo los torneos ABIERTOS con la ventana de check-in ya cerrada', async () => {
    const uow = new UnidadDeTrabajoMemoria();
    const crear = new CrearTorneo({ unidadDeTrabajo: uow });
    const vencido = await crear.ejecutar({ ...base, nombre: 'Vencido', finCheckin: '2026-12-11T01:00:00Z' });
    const vigente = await crear.ejecutar({ ...base, nombre: 'Vigente', finCheckin: '2026-12-11T05:00:00Z' });

    const ahora = new Date('2026-12-11T02:00:00Z');
    const resultado = await uow.torneos.obtenerAbiertosConCheckinVencido(ahora);

    assert.deepEqual(resultado.map((t) => t.id), [vencido.id]);
    assert.ok(!resultado.some((t) => t.id === vigente.id));
  });

  it('no devuelve torneos que ya no estan ABIERTOS', async () => {
    const uow = new UnidadDeTrabajoMemoria();
    const crear = new CrearTorneo({ unidadDeTrabajo: uow });
    const torneo = await crear.ejecutar({ ...base, nombre: 'Cancelado', finCheckin: '2026-12-11T01:00:00Z' });
    const guardado = await uow.torneos.obtenerPorId(torneo.id);
    guardado.estado = 'CANCELADO';
    await uow.torneos.guardar(guardado);

    const resultado = await uow.torneos.obtenerAbiertosConCheckinVencido(new Date('2026-12-12T00:00:00Z'));
    assert.equal(resultado.length, 0);
  });
});