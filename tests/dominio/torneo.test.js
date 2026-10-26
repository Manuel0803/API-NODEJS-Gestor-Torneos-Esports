import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Torneo,
  FORMATOS_TORNEO
} from '../../src/dominio/entidades/Torneo.js';
import {
  CupoAgotadoError,
  TorneoCerradoError,
  CheckinFueraDeVentanaError,
  ReglaDeNegocioError
} from '../../src/dominio/errores/index.js';

describe('Entidad de Dominio: Torneo', () => {
  const fechasBase = {
    fechaCierreInscripcion: new Date('2026-11-01T12:00:00Z'),
    inicioCheckin: new Date('2026-11-01T13:00:00Z'),
    finCheckin: new Date('2026-11-01T14:00:00Z')
  };

  const torneoBase = {
    id: 'torneo-uuid-1',
    nombre: 'Torneo Apertura Valorant',
    juego: 'Valorant',
    formato: FORMATOS_TORNEO.ELIMINACION_SIMPLE,
    cupoMaximo: 16,
    tamanoEquipo: 5,
    ...fechasBase
  };

  describe('Inscripciones y Cupo', () => {
    it('permite inscribir equipos si hay cupo y está en fecha', () => {
      const torneo = new Torneo({ ...torneoBase, inscriptosActuales: 5 });
      const fechaActual = new Date('2026-11-01T10:00:00Z');

      const nuevosInscriptos = torneo.registrarInscripcion(fechaActual);
      assert.equal(nuevosInscriptos, 6);
      assert.equal(torneo.inscriptosActuales, 6);
    });

    it('lanza CupoAgotadoError si se supera el cupo máximo', () => {
      const torneo = new Torneo({ ...torneoBase, cupoMaximo: 10, inscriptosActuales: 10 });
      const fechaActual = new Date('2026-11-01T10:00:00Z');

      assert.throws(
        () => torneo.registrarInscripcion(fechaActual),
        CupoAgotadoError
      );
    });

    it('lanza TorneoCerradoError si la fecha de inscripción venció', () => {
      const torneo = new Torneo({ ...torneoBase, inscriptosActuales: 2 });
      const fechaDespuesDeCierre = new Date('2026-11-01T12:00:01Z');

      assert.throws(
        () => torneo.registrarInscripcion(fechaDespuesDeCierre),
        TorneoCerradoError
      );
    });
  });

  describe('Ventana de Check-in', () => {
    it('valida correctamente si está dentro de la ventana de check-in', () => {
      const torneo = new Torneo({ ...torneoBase });
      const dentroDeVentana = new Date('2026-11-01T13:30:00Z');
      const antesDeVentana = new Date('2026-11-01T12:59:59Z');
      const despuesDeVentana = new Date('2026-11-01T14:00:01Z');

      assert.equal(torneo.estaEnVentanaCheckin(dentroDeVentana), true);
      assert.equal(torneo.estaEnVentanaCheckin(antesDeVentana), false);
      assert.equal(torneo.estaEnVentanaCheckin(despuesDeVentana), false);
      assert.equal(torneo.checkinHaVencido(despuesDeVentana), true);
    });

    it('lanza CheckinFueraDeVentanaError si se intenta check-in antes de tiempo', () => {
      const torneo = new Torneo({ ...torneoBase });
      const antes = new Date('2026-11-01T12:00:00Z');

      assert.throws(
        () => torneo.validarCheckinPermitido(antes),
        CheckinFueraDeVentanaError
      );
    });

    it('lanza CheckinFueraDeVentanaError si se intenta check-in luego de vencido', () => {
      const torneo = new Torneo({ ...torneoBase });
      const despues = new Date('2026-11-01T14:05:00Z');

      assert.throws(
        () => torneo.validarCheckinPermitido(despues),
        CheckinFueraDeVentanaError
      );
    });
  });

  describe('Generación Determinista de Llaves con Descansos (Byes)', () => {
    it('genera exactamente 3 descansos (byes) para N = 13 participantes (potencia 16)', () => {
      const torneo = new Torneo({ ...torneoBase, cupoMaximo: 16 });

      const equipos13 = Array.from({ length: 13 }, (_, i) => ({
        equipoId: `equipo-${i + 1}`,
        ordenInscripcion: i + 1
      }));

      const partidos = torneo.generarEstructuraLlave(equipos13);

      assert.equal(partidos.length, 15);

      const ronda1 = partidos.filter(p => p.ronda === 1);
      const ronda2 = partidos.filter(p => p.ronda === 2);
      const ronda3 = partidos.filter(p => p.ronda === 3);
      const ronda4 = partidos.filter(p => p.ronda === 4);

      assert.equal(ronda1.length, 8);
      assert.equal(ronda2.length, 4);
      assert.equal(ronda3.length, 2);
      assert.equal(ronda4.length, 1);

      const byesRonda1 = ronda1.filter(p => p.esBye);
      assert.equal(byesRonda1.length, 3);

      assert.equal(byesRonda1[0].equipoAId, 'equipo-1');
      assert.equal(byesRonda1[0].ganadorId, 'equipo-1');
      assert.equal(byesRonda1[0].estado, 'CONFIRMADO');

      assert.equal(byesRonda1[1].equipoAId, 'equipo-2');
      assert.equal(byesRonda1[1].ganadorId, 'equipo-2');
      assert.equal(byesRonda1[1].estado, 'CONFIRMADO');

      assert.equal(byesRonda1[2].equipoAId, 'equipo-3');
      assert.equal(byesRonda1[2].ganadorId, 'equipo-3');
      assert.equal(byesRonda1[2].estado, 'CONFIRMADO');

      assert.equal(ronda2[0].equipoAId, 'equipo-1');
      assert.equal(ronda2[0].equipoBId, 'equipo-2');
      assert.equal(ronda2[1].equipoAId, 'equipo-3');

      const partidosNormalesR1 = ronda1.filter(p => !p.esBye);
      assert.equal(partidosNormalesR1.length, 5);
      partidosNormalesR1.forEach(p => {
        assert.equal(p.estado, 'EN_JUEGO');
        assert.ok(p.equipoAId);
        assert.ok(p.equipoBId);
      });
    });

    it('la generación de llave es 100% determinista (misma entrada => misma estructura exacta)', () => {
      const torneo = new Torneo({ ...torneoBase, cupoMaximo: 16 });

      const equipos = Array.from({ length: 13 }, (_, i) => ({
        equipoId: `equipo-${i + 1}`,
        ordenInscripcion: i + 1
      }));

      const ejecucion1 = torneo.generarEstructuraLlave(equipos);
      const ejecucion2 = torneo.generarEstructuraLlave(equipos);

      assert.equal(ejecucion1.length, ejecucion2.length);

      for (let i = 0; i < ejecucion1.length; i++) {
        assert.equal(ejecucion1[i].ronda, ejecucion2[i].ronda);
        assert.equal(ejecucion1[i].posicionEnRonda, ejecucion2[i].posicionEnRonda);
        assert.equal(ejecucion1[i].equipoAId, ejecucion2[i].equipoAId);
        assert.equal(ejecucion1[i].equipoBId, ejecucion2[i].equipoBId);
        assert.equal(ejecucion1[i].esBye, ejecucion2[i].esBye);
        assert.equal(ejecucion1[i].ganadorId, ejecucion2[i].ganadorId);
        assert.equal(ejecucion1[i].slotSiguiente, ejecucion2[i].slotSiguiente);
      }
    });

    it('falla si se intenta armar una llave con menos de 2 participantes', () => {
      const torneo = new Torneo({ ...torneoBase });
      assert.throws(
        () => torneo.generarEstructuraLlave([{ equipoId: 'eq-1', ordenInscripcion: 1 }]),
        ReglaDeNegocioError
      );
    });
  });
});
