import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { ReglaDeNegocioError } from '../../src/dominio/errores/index.js';

describe('Entidad de Dominio: Equipo', () => {
  const equipoBase = {
    id: 'eq-1',
    nombre: 'KRÜ Esports',
    capitanId: 'usr-capitan-1'
  };

  it('crea un equipo válido', () => {
    const equipo = new Equipo(equipoBase);

    assert.equal(equipo.id, 'eq-1');
    assert.equal(equipo.nombre, 'KRÜ Esports');
    assert.equal(equipo.capitanId, 'usr-capitan-1');
    assert.equal(equipo.esCapitan('usr-capitan-1'), true);
    assert.equal(equipo.esCapitan('usr-otro'), false);
  });

  it('rechaza campos obligatorios faltantes', () => {
    assert.throws(() => new Equipo({ ...equipoBase, id: null }), ReglaDeNegocioError);
    assert.throws(() => new Equipo({ ...equipoBase, nombre: '' }), ReglaDeNegocioError);
    assert.throws(() => new Equipo({ ...equipoBase, capitanId: null }), ReglaDeNegocioError);
  });

  it('rechaza nombres con menos de 3 caracteres', () => {
    assert.throws(() => new Equipo({ ...equipoBase, nombre: 'AB' }), ReglaDeNegocioError);
    assert.throws(() => new Equipo({ ...equipoBase, nombre: '  A  ' }), ReglaDeNegocioError);
  });

  it('hace trim al nombre del equipo', () => {
    const equipo = new Equipo({ ...equipoBase, nombre: '  Leviatán  ' });
    assert.equal(equipo.nombre, 'Leviatán');
  });
});
