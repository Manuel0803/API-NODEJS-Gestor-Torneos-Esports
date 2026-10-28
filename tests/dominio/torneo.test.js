import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Torneo,
  ESTADOS_TORNEO,
  FORMATOS_TORNEO
} from '../../src/dominio/entidades/Torneo.js';
import { ESTADOS_PARTIDO } from '../../src/dominio/entidades/Partido.js';
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
    semillaSorteo: 'semilla-torneo-test-2026',
    ...fechasBase
  };

  describe('Construcción y Validación de Invariantes', () => {
    it('crea un torneo válido con valores por defecto', () => {
      const torneo = new Torneo({ ...torneoBase });
      assert.equal(torneo.id, 'torneo-uuid-1');
      assert.equal(torneo.nombre, 'Torneo Apertura Valorant');
      assert.equal(torneo.estado, ESTADOS_TORNEO.ABIERTO);
      assert.equal(torneo.semillaSorteo, 'semilla-torneo-test-2026');
      assert.equal(torneo.inscriptosActuales, 0);
    });

    it('exige semilla de sorteo obligatoria no vacía', () => {
      assert.throws(
        () => new Torneo({ ...torneoBase, semillaSorteo: '' }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Torneo({ ...torneoBase, semillaSorteo: '   ' }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Torneo({ ...torneoBase, semillaSorteo: null }),
        ReglaDeNegocioError
      );
    });

    it('rechaza orden cronológico incorrecto en fechas', () => {
      assert.throws(
        () => new Torneo({
          ...torneoBase,
          fechaCierreInscripcion: new Date('2026-11-01T13:30:00Z'),
          inicioCheckin: new Date('2026-11-01T13:00:00Z')
        }),
        ReglaDeNegocioError
      );

      assert.throws(
        () => new Torneo({
          ...torneoBase,
          inicioCheckin: new Date('2026-11-01T15:00:00Z'),
          finCheckin: new Date('2026-11-01T14:00:00Z')
        }),
        ReglaDeNegocioError
      );
    });

    it('rechaza cupo menor a 2 o no entero', () => {
      assert.throws(
        () => new Torneo({ ...torneoBase, cupoMaximo: 1 }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Torneo({ ...torneoBase, cupoMaximo: 4.5 }),
        ReglaDeNegocioError
      );
    });

    it('rechaza formatos y estados inválidos', () => {
      assert.throws(
        () => new Torneo({ ...torneoBase, formato: 'LIGA_ESPANOLA' }),
        ReglaDeNegocioError
      );
      assert.throws(
        () => new Torneo({ ...torneoBase, estado: 'PAUSADO' }),
        ReglaDeNegocioError
      );
    });

    it('rechaza campos obligatorios faltantes en constructor', () => {
      assert.throws(() => new Torneo({ ...torneoBase, id: null }), ReglaDeNegocioError);
      assert.throws(() => new Torneo({ ...torneoBase, nombre: '' }), ReglaDeNegocioError);
      assert.throws(() => new Torneo({ ...torneoBase, juego: null }), ReglaDeNegocioError);
      assert.throws(() => new Torneo({ ...torneoBase, cupoMaximo: null }), ReglaDeNegocioError);
    });

    it('rechaza tamaño de equipo menor a 1 o inscriptos fuera de rango', () => {
      assert.throws(() => new Torneo({ ...torneoBase, tamanoEquipo: 0 }), ReglaDeNegocioError);
      assert.throws(() => new Torneo({ ...torneoBase, inscriptosActuales: -1 }), ReglaDeNegocioError);
      assert.throws(() => new Torneo({ ...torneoBase, inscriptosActuales: 20 }), ReglaDeNegocioError);
    });

    it('rechaza fechas inválidas con valores no parseables', () => {
      assert.throws(() => new Torneo({ ...torneoBase, fechaCierreInscripcion: 'fecha-invalida' }), ReglaDeNegocioError);
    });
  });

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

    it('lanza TorneoCerradoError si la fecha de inscripción venció o el torneo no está ABIERTO', () => {
      const torneo = new Torneo({ ...torneoBase, inscriptosActuales: 2 });
      const fechaDespuesDeCierre = new Date('2026-11-01T12:00:01Z');

      assert.throws(
        () => torneo.registrarInscripcion(fechaDespuesDeCierre),
        TorneoCerradoError
      );

      const torneoEnCurso = new Torneo({ ...torneoBase, estado: ESTADOS_TORNEO.EN_CURSO });
      assert.throws(
        () => torneoEnCurso.registrarInscripcion(new Date('2026-11-01T10:00:00Z')),
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

    it('lanza TorneoCerradoError si el torneo no está ABIERTO al validar check-in', () => {
      const torneo = new Torneo({ ...torneoBase, estado: ESTADOS_TORNEO.EN_CURSO });
      assert.throws(
        () => torneo.validarCheckinPermitido(new Date('2026-11-01T13:30:00Z')),
        TorneoCerradoError
      );
    });
  });

  describe('Generación Determinista de Llaves con Siembra Estándar y Byes', () => {
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

      const partidoBye1 = ronda1.find(p => p.posicionEnRonda === 1);
      const partidoBye2 = ronda1.find(p => p.posicionEnRonda === 5);
      const partidoBye3 = ronda1.find(p => p.posicionEnRonda === 7);

      assert.equal(partidoBye1.esBye, true);
      assert.equal(partidoBye1.equipoAId, 'equipo-1');
      assert.equal(partidoBye1.ganadorId, 'equipo-1');
      assert.equal(partidoBye1.estado, ESTADOS_PARTIDO.CONFIRMADO);

      assert.equal(partidoBye2.esBye, true);
      assert.equal(partidoBye2.equipoAId, 'equipo-2');
      assert.equal(partidoBye2.ganadorId, 'equipo-2');
      assert.equal(partidoBye2.estado, ESTADOS_PARTIDO.CONFIRMADO);

      assert.equal(partidoBye3.esBye, true);
      assert.equal(partidoBye3.equipoAId, 'equipo-3');
      assert.equal(partidoBye3.ganadorId, 'equipo-3');
      assert.equal(partidoBye3.estado, ESTADOS_PARTIDO.CONFIRMADO);

      assert.equal(ronda2[0].equipoAId, 'equipo-1');
      assert.equal(ronda2[2].equipoAId, 'equipo-2');
      assert.equal(ronda2[3].equipoAId, 'equipo-3');

      const partidosNormalesR1 = ronda1.filter(p => !p.esBye);
      assert.equal(partidosNormalesR1.length, 5);
      partidosNormalesR1.forEach(p => {
        assert.equal(p.estado, ESTADOS_PARTIDO.EN_JUEGO);
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

      let idSeq1 = 1;
      let idSeq2 = 1;
      const ejecucion1 = torneo.generarEstructuraLlave(equipos, { generarId: () => `match-${idSeq1++}` });
      const ejecucion2 = torneo.generarEstructuraLlave(equipos, { generarId: () => `match-${idSeq2++}` });

      assert.equal(ejecucion1.length, ejecucion2.length);

      for (let i = 0; i < ejecucion1.length; i++) {
        assert.equal(ejecucion1[i].id, ejecucion2[i].id);
        assert.equal(ejecucion1[i].ronda, ejecucion2[i].ronda);
        assert.equal(ejecucion1[i].posicionEnRonda, ejecucion2[i].posicionEnRonda);
        assert.equal(ejecucion1[i].equipoAId, ejecucion2[i].equipoAId);
        assert.equal(ejecucion1[i].equipoBId, ejecucion2[i].equipoBId);
        assert.equal(ejecucion1[i].esBye, ejecucion2[i].esBye);
        assert.equal(ejecucion1[i].ganadorId, ejecucion2[i].ganadorId);
        assert.equal(ejecucion1[i].slotSiguiente, ejecucion2[i].slotSiguiente);
      }
    });

    it('dos semillas distintas generan cruces diferentes pero conservan los Byes deterministas', () => {
      const equipos = Array.from({ length: 13 }, (_, i) => ({
        equipoId: `equipo-${i + 1}`,
        ordenInscripcion: i + 1
      }));

      const torneoA = new Torneo({ ...torneoBase, semillaSorteo: 'semilla-alpha-123' });
      const torneoB = new Torneo({ ...torneoBase, semillaSorteo: 'semilla-beta-987' });

      const llaveA = torneoA.generarEstructuraLlave(equipos);
      const llaveB = torneoB.generarEstructuraLlave(equipos);

      const byesA = llaveA.filter(p => p.ronda === 1 && p.esBye);
      const byesB = llaveB.filter(p => p.ronda === 1 && p.esBye);

      assert.equal(byesA.length, byesB.length);
      assert.equal(byesA[0].equipoAId, byesB[0].equipoAId);
      assert.equal(byesA[1].equipoAId, byesB[1].equipoAId);
      assert.equal(byesA[2].equipoAId, byesB[2].equipoAId);

      const normalesA = llaveA.filter(p => p.ronda === 1 && !p.esBye);
      const normalesB = llaveB.filter(p => p.ronda === 1 && !p.esBye);

      const crucesA = normalesA.map(p => `${p.equipoAId}-vs-${p.equipoBId}`).join(',');
      const crucesB = normalesB.map(p => `${p.equipoAId}-vs-${p.equipoBId}`).join(',');

      assert.notEqual(crucesA, crucesB);
    });

    it('rechaza listas con equipos duplicados', () => {
      const torneo = new Torneo({ ...torneoBase });
      const conDuplicado = [
        { equipoId: 'eq-1', ordenInscripcion: 1 },
        { equipoId: 'eq-1', ordenInscripcion: 2 }
      ];

      assert.throws(
        () => torneo.generarEstructuraLlave(conDuplicado),
        ReglaDeNegocioError
      );
    });

    it('falla si se intenta armar una llave con menos de 2 participantes', () => {
      const torneo = new Torneo({ ...torneoBase });
      assert.throws(
        () => torneo.generarEstructuraLlave([{ equipoId: 'eq-1', ordenInscripcion: 1 }]),
        ReglaDeNegocioError
      );
    });

    it('pasa automáticamente a EN_JUEGO en Ronda 2 cuando dos Byes alimentan el mismo partido (N = 5 en potencia 8)', () => {
      const torneo = new Torneo({ ...torneoBase, cupoMaximo: 8 });
      const equipos5 = Array.from({ length: 5 }, (_, i) => ({
        equipoId: `eq-${i + 1}`,
        ordenInscripcion: i + 1
      }));

      const partidos = torneo.generarEstructuraLlave(equipos5);
      const ronda2 = partidos.filter(p => p.ronda === 2);

      // En N = 5 (P = 8, 3 byes): siembras con bye son 1, 2 y 3.
      // Siembra 1 alimenta R2 pos 1 slot A.
      // Siembra 2 (pos 3) alimenta R2 pos 2 slot A.
      // Siembra 3 (pos 4) alimenta R2 pos 2 slot B.
      // Por ende, R2 pos 2 tiene ambos slots completos por Byes y pasa a EN_JUEGO!
      const partidoR2DobleBye = ronda2.find(p => p.posicionEnRonda === 2);
      assert.equal(partidoR2DobleBye.equipoAId, 'eq-2');
      assert.equal(partidoR2DobleBye.equipoBId, 'eq-3');
      assert.equal(partidoR2DobleBye.estado, ESTADOS_PARTIDO.EN_JUEGO);
    });
  });

  describe('Ciclo de Vida del Torneo', () => {
    it('iniciarTorneo valida que la ventana de check-in haya cerrado', () => {
      const torneo = new Torneo({ ...torneoBase });
      const antesDeCheckin = new Date('2026-11-01T12:30:00Z');
      const dentroDeCheckin = new Date('2026-11-01T13:30:00Z');
      const despuesDeCheckin = new Date('2026-11-01T14:01:00Z');

      assert.throws(
        () => torneo.iniciarTorneo({ fechaActual: antesDeCheckin, cantidadConfirmados: 8 }),
        ReglaDeNegocioError
      );

      assert.throws(
        () => torneo.iniciarTorneo({ fechaActual: dentroDeCheckin, cantidadConfirmados: 8 }),
        ReglaDeNegocioError
      );

      torneo.iniciarTorneo({ fechaActual: despuesDeCheckin, cantidadConfirmados: 8 });
      assert.equal(torneo.estado, ESTADOS_TORNEO.EN_CURSO);
    });

    it('iniciarTorneo valida que haya al menos 2 confirmados válidos', () => {
      const torneo = new Torneo({ ...torneoBase });
      const despuesDeCheckin = new Date('2026-11-01T14:01:00Z');

      assert.throws(
        () => torneo.iniciarTorneo({ fechaActual: despuesDeCheckin, cantidadConfirmados: 1 }),
        ReglaDeNegocioError
      );

      assert.throws(
        () => torneo.iniciarTorneo({ fechaActual: despuesDeCheckin, cantidadConfirmados: 'ocho' }),
        ReglaDeNegocioError
      );
    });

    it('iniciarTorneo falla si el torneo no está ABIERTO', () => {
      const torneo = new Torneo({ ...torneoBase, estado: ESTADOS_TORNEO.EN_CURSO });
      const despuesDeCheckin = new Date('2026-11-01T14:01:00Z');

      assert.throws(
        () => torneo.iniciarTorneo({ fechaActual: despuesDeCheckin, cantidadConfirmados: 8 }),
        TorneoCerradoError
      );
    });

    it('finalizarTorneo exige que el partido final esté confirmado y con ganador', () => {
      const torneo = new Torneo({ ...torneoBase, estado: ESTADOS_TORNEO.EN_CURSO });

      assert.throws(
        () => torneo.finalizarTorneo({
          partidoFinal: {
            estado: ESTADOS_PARTIDO.CONFIRMADO,
            ganadorId: 'eq-1',
            siguientePartidoId: 'otro-partido'
          }
        }),
        ReglaDeNegocioError
      );

      assert.throws(
        () => torneo.finalizarTorneo({
          partidoFinal: {
            estado: ESTADOS_PARTIDO.EN_JUEGO,
            ganadorId: null,
            siguientePartidoId: null
          }
        }),
        ReglaDeNegocioError
      );

      torneo.finalizarTorneo({
        partidoFinal: {
          estado: ESTADOS_PARTIDO.CONFIRMADO,
          ganadorId: 'campeon-uuid',
          siguientePartidoId: null
        }
      });
      assert.equal(torneo.estado, ESTADOS_TORNEO.FINALIZADO);
    });

    it('finalizarTorneo falla si el torneo no está EN_CURSO', () => {
      const torneo = new Torneo({ ...torneoBase, estado: ESTADOS_TORNEO.ABIERTO });

      assert.throws(
        () => torneo.finalizarTorneo({
          partidoFinal: {
            estado: ESTADOS_PARTIDO.CONFIRMADO,
            ganadorId: 'campeon-uuid',
            siguientePartidoId: null
          }
        }),
        TorneoCerradoError
      );
    });
  });
});
