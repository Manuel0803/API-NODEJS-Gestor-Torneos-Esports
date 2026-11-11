import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CrearTorneo } from '../../src/dominio/casos-de-uso/CrearTorneo.js';
import { ESTADOS_TORNEO } from '../../src/dominio/entidades/Torneo.js';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { ReglaDeNegocioError } from '../../src/dominio/errores/index.js';

const datosValidos = {                             
  nombre: 'Copa', juego: 'LoL', cupoMaximo: 8, tamanoEquipo: 2, semillaSorteo: 'semilla-test',
  fechaCierreInscripcion: '2026-12-10T00:00:00Z',
  inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
};

function preparar() {                              
  const uow = new UnidadDeTrabajoMemoria();
  return { uow, casoDeUso: new CrearTorneo({ unidadDeTrabajo: uow }) };
}

describe('CrearTorneo', () => {
  it('crea el torneo y lo guarda ABIERTO y con 0 inscriptos', async () => {
    const { uow, casoDeUso } = preparar();
    const torneo = await casoDeUso.ejecutar(datosValidos);
    const guardado = await uow.torneos.obtenerPorId(torneo.id); 
    assert.equal(guardado.nombre, 'Copa');
    assert.equal(guardado.estado, ESTADOS_TORNEO.ABIERTO);
    assert.equal(guardado.inscriptosActuales, 0);
    assert.equal(guardado.semillaSorteo, 'semilla-test'); 
  });

  it('asigna un id distinto a cada torneo', async () => {
    const { casoDeUso } = preparar();
    const a = await casoDeUso.ejecutar(datosValidos);
    const b = await casoDeUso.ejecutar(datosValidos);
    assert.notEqual(a.id, b.id);
  });

  it('rechaza un torneo sin semilla y no guarda nada', async () => {
    const { uow, casoDeUso } = preparar();
    await assert.rejects(() => casoDeUso.ejecutar({ ...datosValidos, semillaSorteo: '' }), ReglaDeNegocioError);
    assert.equal(uow.torneos.datos.size, 0);       
  });

  it('rechaza un cupo menor a 2', async () => {
    const { casoDeUso } = preparar();
    await assert.rejects(() => casoDeUso.ejecutar({ ...datosValidos, cupoMaximo: 1 }), ReglaDeNegocioError);
  });

  it('rechaza una ventana de check-in invertida', async () => {
    const { casoDeUso } = preparar();
    await assert.rejects(
      () => casoDeUso.ejecutar({ ...datosValidos, inicioCheckin: '2026-12-11T02:00:00Z' }), 
      ReglaDeNegocioError,
    );
  });
});