import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Inscripcion,
  ESTADOS_INSCRIPCION
} from '../../src/dominio/entidades/Inscripcion.js';
import { ReglaDeNegocioError } from '../../src/dominio/errores/index.js';

describe('Entidad de Dominio: Inscripcion', () => {
  const inscripcionBase = {
    id: 'insc-1',
    torneoId: 'torneo-1',
    equipoId: 'equipo-1',
    ordenInscripcion: 1,
    jugadoresIds: ['j-1', 'j-2', 'j-3', 'j-4', 'j-5']
  };

  describe('Construcción e Invariantes', () => {
    it('crea una inscripción válida con valores por defecto', () => {
      const insc = new Inscripcion(inscripcionBase);

      assert.equal(insc.id, 'insc-1');
      assert.equal(insc.torneoId, 'torneo-1');
      assert.equal(insc.equipoId, 'equipo-1');
      assert.equal(insc.ordenInscripcion, 1);
      assert.equal(insc.checkinConfirmado, false);
      assert.equal(insc.estado, ESTADOS_INSCRIPCION.CONFIRMADA);
      assert.equal(insc.jugadoresIds.length, 5);
      assert.ok(insc.creadoEn instanceof Date);

      const conStringDate = new Inscripcion({
        ...inscripcionBase,
        jugadoresIds: null,
        creadoEn: '2026-10-28T12:00:00Z'
      });
      assert.deepEqual(conStringDate.jugadoresIds, []);
      assert.ok(conStringDate.creadoEn instanceof Date);
    });

    it('exige id, torneoId, equipoId y ordenInscripcion obligatorios', () => {
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, id: null }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, torneoId: '' }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, equipoId: undefined }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, ordenInscripcion: null }),
        ReglaDeNegocioError
      );
    });

    it('rechaza orden de inscripción menor a 1 o no entero', () => {
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, ordenInscripcion: 0 }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, ordenInscripcion: -5 }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, ordenInscripcion: 2.5 }),
        ReglaDeNegocioError
      );
    });

    it('rechaza estados desconocidos', () => {
      assert.throws(
        () => new Inscripcion({ ...inscripcionBase, estado: 'SUSPENDIDA' }),
        ReglaDeNegocioError
      );
    });

    it('no permite que un equipo ELIMINADO_WO inicie con check-in confirmado', () => {
      assert.throws(
        () => new Inscripcion({
          ...inscripcionBase,
          estado: ESTADOS_INSCRIPCION.ELIMINADO_WO,
          checkinConfirmado: true
        }),
        ReglaDeNegocioError
      );
    });

    it('rechaza nómina de jugadores con duplicados', () => {
      assert.throws(
        () => new Inscripcion({
          ...inscripcionBase,
          jugadoresIds: ['j-1', 'j-2', 'j-1']
        }),
        ReglaDeNegocioError
      );
    });
  });

  describe('Check-in y Sorteo', () => {
    it('confirmarCheckin marca checkinConfirmado en true', () => {
      const insc = new Inscripcion(inscripcionBase);
      assert.equal(insc.checkinConfirmado, false);
      assert.equal(insc.participaDelSorteo(), false);

      insc.confirmarCheckin();
      assert.equal(insc.checkinConfirmado, true);
      assert.equal(insc.participaDelSorteo(), true);
    });

    it('no permite confirmar check-in a un equipo eliminado por W.O.', () => {
      const insc = new Inscripcion(inscripcionBase);
      insc.eliminarPorWO();

      assert.throws(() => insc.confirmarCheckin(), ReglaDeNegocioError);
    });

    it('eliminarPorWO cambia el estado a ELIMINADO_WO y queda fuera del sorteo', () => {
      const insc = new Inscripcion(inscripcionBase);
      insc.eliminarPorWO();

      assert.equal(insc.estado, ESTADOS_INSCRIPCION.ELIMINADO_WO);
      assert.equal(insc.participaDelSorteo(), false);
    });

    it('no permite eliminar por W.O. a un equipo que ya confirmó check-in', () => {
      const insc = new Inscripcion(inscripcionBase);
      insc.confirmarCheckin();

      assert.throws(() => insc.eliminarPorWO(), ReglaDeNegocioError);
      assert.equal(insc.estado, ESTADOS_INSCRIPCION.CONFIRMADA);
    });
  });

  describe('Validaciones de Jugadores y Nómina', () => {
    it('contieneJugador verifica pertenencia correctamente', () => {
      const insc = new Inscripcion(inscripcionBase);

      assert.equal(insc.contieneJugador('j-1'), true);
      assert.equal(insc.contieneJugador('j-99'), false);
    });

    it('validarTamano valida que la cantidad de jugadores coincida con el torneo', () => {
      const insc = new Inscripcion(inscripcionBase);

      assert.doesNotThrow(() => insc.validarTamano(5));
      assert.throws(() => insc.validarTamano(3), ReglaDeNegocioError);
      assert.throws(() => insc.validarTamano(6), ReglaDeNegocioError);
    });
  });
});
