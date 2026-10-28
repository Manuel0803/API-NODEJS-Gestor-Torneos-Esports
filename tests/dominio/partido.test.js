import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Partido,
  ESTADOS_PARTIDO,
  RESULTADOS_REPORTE,
  RESOLUCIONES_ANULACION
} from '../../src/dominio/entidades/Partido.js';
import {
  PartidoNoModificableError,
  ReporteInvalidoError,
  ReglaDeNegocioError
} from '../../src/dominio/errores/index.js';

describe('Entidad de Dominio: Partido', () => {
  const partidoBase = {
    id: 'partido-uuid-1',
    torneoId: 'torneo-uuid-1',
    ronda: 1,
    posicionEnRonda: 1,
    equipoAId: 'equipo-a',
    equipoBId: 'equipo-b'
  };

  const confirmado = (extra = {}) => new Partido({
    ...partidoBase,
    estado: ESTADOS_PARTIDO.CONFIRMADO,
    ganadorId: 'equipo-a',
    reporteEquipoA: RESULTADOS_REPORTE.GANA_A,
    reporteEquipoB: RESULTADOS_REPORTE.GANA_A,
    siguientePartidoId: 'partido-r2-1',
    slotSiguiente: 'A',
    ...extra
  });

  describe('Construcción', () => {
    it('no permite que un equipo juegue contra sí mismo', () => {
      assert.throws(
        () => new Partido({ ...partidoBase, equipoAId: 'equipo-x', equipoBId: 'equipo-x' }),
        ReglaDeNegocioError
      );
    });

    it('rechaza estados inexistentes, incluido el antiguo ANULADO', () => {
      assert.throws(() => new Partido({ ...partidoBase, estado: 'ANULADO' }), ReglaDeNegocioError);
    });

    it('rechaza un slot siguiente inválido', () => {
      assert.throws(() => new Partido({ ...partidoBase, slotSiguiente: 'C' }), ReglaDeNegocioError);
    });

    it('rechaza campos obligatorios faltantes en constructor', () => {
      assert.throws(() => new Partido({ ...partidoBase, id: null }), ReglaDeNegocioError);
      assert.throws(() => new Partido({ ...partidoBase, torneoId: null }), ReglaDeNegocioError);
      assert.throws(() => new Partido({ ...partidoBase, ronda: undefined }), ReglaDeNegocioError);
      assert.throws(() => new Partido({ ...partidoBase, posicionEnRonda: undefined }), ReglaDeNegocioError);
    });
  });

  describe('Asignación de equipos', () => {
    it('pasa a EN_JUEGO cuando se completan ambos slots', () => {
      const partidoB = new Partido({ ...partidoBase, equipoBId: null });
      partidoB.asignarEquipo('B', 'equipo-c');
      assert.equal(partidoB.equipoBId, 'equipo-c');
      assert.equal(partidoB.estado, ESTADOS_PARTIDO.EN_JUEGO);

      const partidoA = new Partido({ ...partidoBase, equipoAId: null });
      partidoA.asignarEquipo('A', 'equipo-c');
      assert.equal(partidoA.equipoAId, 'equipo-c');
      assert.equal(partidoA.estado, ESTADOS_PARTIDO.EN_JUEGO);
    });

    it('no permite cambiar equipos en un partido que ya está EN_JUEGO', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      assert.throws(() => partido.asignarEquipo('B', 'equipo-c'), PartidoNoModificableError);
    });

    it('no permite asignar el mismo equipo en ambos slots', () => {
      const partido = new Partido({ ...partidoBase, equipoBId: null });

      assert.throws(() => partido.asignarEquipo('B', 'equipo-a'), ReglaDeNegocioError);
    });

    it('no permite asignar equipos a un partido Bye', () => {
      const bye = new Partido({ ...partidoBase, equipoAId: 'equipo-a', equipoBId: null, esBye: true });
      assert.throws(() => bye.asignarEquipo('B', 'equipo-b'), ReglaDeNegocioError);
    });
  });

  describe('Doble reporte de resultados', () => {
    it('permanece en EN_JUEGO cuando solo un equipo ha reportado', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      const res = partido.registrarReporte({
        equipoId: 'equipo-a',
        resultado: RESULTADOS_REPORTE.GANA_A,
        evidenciaUrl: 'https://evidencia.com/a.png'
      });

      assert.equal(partido.estado, ESTADOS_PARTIDO.EN_JUEGO);
      assert.equal(partido.ganadorId, null);
      assert.equal(res.confirmado, false);
      assert.equal(res.enDisputa, false);
    });

    it('pasa a CONFIRMADO automáticamente cuando ambos reportes coinciden (GANA_A)', () => {
      const partido = new Partido({
        ...partidoBase,
        estado: ESTADOS_PARTIDO.EN_JUEGO,
        siguientePartidoId: 'partido-r2-1',
        slotSiguiente: 'A'
      });

      partido.registrarReporte({ equipoId: 'equipo-a', resultado: RESULTADOS_REPORTE.GANA_A });
      const res = partido.registrarReporte({ equipoId: 'equipo-b', resultado: RESULTADOS_REPORTE.GANA_A });

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-a');
      assert.equal(res.confirmado, true);
      assert.equal(res.avanza, true);
      assert.equal(res.siguientePartidoId, 'partido-r2-1');
      assert.equal(res.slotSiguiente, 'A');
    });

    it('pasa a CONFIRMADO automáticamente cuando ambos reportes coinciden (GANA_B)', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      partido.registrarReporte({ equipoId: 'equipo-a', resultado: RESULTADOS_REPORTE.GANA_B });
      partido.registrarReporte({ equipoId: 'equipo-b', resultado: RESULTADOS_REPORTE.GANA_B });

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-b');
    });

    it('pasa a EN_DISPUTA si los dos capitanes reportan resultados contradictorios', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      partido.registrarReporte({ equipoId: 'equipo-a', resultado: RESULTADOS_REPORTE.GANA_A });
      const res = partido.registrarReporte({ equipoId: 'equipo-b', resultado: RESULTADOS_REPORTE.GANA_B });

      assert.equal(partido.estado, ESTADOS_PARTIDO.EN_DISPUTA);
      assert.equal(partido.ganadorId, null);
      assert.equal(res.enDisputa, true);
      assert.equal(res.avanza, false);
    });

    it('rechaza reportes de equipos que no forman parte del partido', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      assert.throws(
        () => partido.registrarReporte({ equipoId: 'equipo-intruso', resultado: RESULTADOS_REPORTE.GANA_A }),
        ReporteInvalidoError
      );
    });

    it('rechaza resultados no reconocidos', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      assert.throws(
        () => partido.registrarReporte({ equipoId: 'equipo-a', resultado: 'EMPATE' }),
        ReporteInvalidoError
      );
    });

    it('rechaza reportes de capitanes si el partido está en EN_DISPUTA (exclusividad arbitral)', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_DISPUTA });

      assert.throws(
        () => partido.registrarReporte({ equipoId: 'equipo-a', resultado: RESULTADOS_REPORTE.GANA_A }),
        PartidoNoModificableError
      );
    });

    it('rechaza reportes sobre un partido CONFIRMADO', () => {
      assert.throws(
        () => confirmado().registrarReporte({ equipoId: 'equipo-b', resultado: RESULTADOS_REPORTE.GANA_B }),
        PartidoNoModificableError
      );
    });
  });

  describe('Resolución arbitral de disputas', () => {
    it('permite al árbitro resolver un partido en disputa y asignar ganador', () => {
      const partido = new Partido({
        ...partidoBase,
        estado: ESTADOS_PARTIDO.EN_DISPUTA,
        siguientePartidoId: 'partido-r2-1',
        slotSiguiente: 'B'
      });

      const res = partido.resolverDisputaArbitral({
        ganadorId: 'equipo-b',
        arbitroId: 'arbitro-1',
        motivo: 'Evidencia concluyente analizada en streaming'
      });

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-b');
      assert.equal(res.avanza, true);
      assert.equal(res.slotSiguiente, 'B');
    });

    it('rechaza resolución si el partido no está en disputa', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      assert.throws(
        () => partido.resolverDisputaArbitral({ ganadorId: 'equipo-a', arbitroId: 'arbitro-1', motivo: 'test' }),
        PartidoNoModificableError
      );
    });

    it('rechaza resolución sin árbitro o sin motivo', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_DISPUTA });

      assert.throws(
        () => partido.resolverDisputaArbitral({ ganadorId: 'equipo-a', arbitroId: 'arbitro-1', motivo: '' }),
        ReglaDeNegocioError
      );
    });
  });

  describe('Anulación arbitral (sin estado terminal)', () => {
    it('REJUGAR: el partido vuelve a EN_JUEGO con reportes limpios y pide revertir la ronda siguiente', () => {
      const partido = confirmado();

      const res = partido.anularPorArbitro({
        arbitroId: 'arbitro-1',
        motivo: 'Caída del servidor del juego',
        resolucion: RESOLUCIONES_ANULACION.REJUGAR
      });

      assert.equal(partido.estado, ESTADOS_PARTIDO.EN_JUEGO);
      assert.equal(partido.ganadorId, null);
      assert.equal(partido.reporteEquipoA, null);
      assert.equal(partido.reporteEquipoB, null);
      assert.equal(res.estadoAnterior.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(res.estadoAnterior.ganadorId, 'equipo-a');
      assert.equal(res.debeRevertirSiguiente, true);
      assert.equal(res.avanza, false);
    });

    it('VICTORIA_ADMINISTRATIVA: cambia el ganador, revierte la ronda siguiente y hace avanzar al nuevo ganador', () => {
      const partido = confirmado();

      const res = partido.anularPorArbitro({
        arbitroId: 'arbitro-1',
        motivo: 'Uso de software no autorizado por equipo-a',
        resolucion: RESOLUCIONES_ANULACION.VICTORIA_ADMINISTRATIVA,
        ganadorId: 'equipo-b'
      });

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-b');
      assert.equal(res.ganadorPrevio, 'equipo-a');
      assert.equal(res.debeRevertirSiguiente, true);
      assert.equal(res.avanza, true);
    });

    it('VICTORIA_ADMINISTRATIVA al mismo ganador no dispara cascada', () => {
      const res = confirmado().anularPorArbitro({
        arbitroId: 'arbitro-1',
        motivo: 'Se ratifica el resultado tras revisión',
        resolucion: RESOLUCIONES_ANULACION.VICTORIA_ADMINISTRATIVA,
        ganadorId: 'equipo-a'
      });

      assert.equal(res.debeRevertirSiguiente, false);
      assert.equal(res.avanza, false);
    });

    it('anular un partido EN_DISPUTA no dispara cascada porque nadie había avanzado', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_DISPUTA });

      const res = partido.anularPorArbitro({
        arbitroId: 'arbitro-1',
        motivo: 'Partido inválido',
        resolucion: RESOLUCIONES_ANULACION.REJUGAR
      });

      assert.equal(partido.estado, ESTADOS_PARTIDO.EN_JUEGO);
      assert.equal(res.debeRevertirSiguiente, false);
    });

    it('exige una resolución válida: la anulación nunca deja el partido trabado', () => {
      assert.throws(
        () => confirmado().anularPorArbitro({ arbitroId: 'arbitro-1', motivo: 'm' }),
        ReglaDeNegocioError
      );
    });

    it('VICTORIA_ADMINISTRATIVA exige un ganador que pertenezca al partido', () => {
      assert.throws(
        () => confirmado().anularPorArbitro({
          arbitroId: 'arbitro-1',
          motivo: 'm',
          resolucion: RESOLUCIONES_ANULACION.VICTORIA_ADMINISTRATIVA,
          ganadorId: 'equipo-intruso'
        }),
        ReporteInvalidoError
      );
    });

    it('no se puede anular un partido EN_JUEGO ni un Bye', () => {
      const enJuego = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });
      const bye = confirmado({ equipoBId: null, esBye: true });
      const args = { arbitroId: 'arbitro-1', motivo: 'm', resolucion: RESOLUCIONES_ANULACION.REJUGAR };

      assert.throws(() => enJuego.anularPorArbitro(args), PartidoNoModificableError);
      assert.throws(() => bye.anularPorArbitro(args), ReglaDeNegocioError);
    });
  });

  describe('Reversión de slot en cascada', () => {
    it('limpia el equipo del slot, borra reportes de ambos slots y vuelve a PENDIENTE', () => {
      const partido = new Partido({
        ...partidoBase,
        ronda: 2,
        estado: ESTADOS_PARTIDO.EN_JUEGO,
        reporteEquipoB: RESULTADOS_REPORTE.GANA_B,
        evidenciaBUrl: 'https://evidencia.com/b.png'
      });

      const res = partido.revertirSlot('A');

      assert.equal(partido.equipoAId, null);
      assert.equal(partido.equipoBId, 'equipo-b');
      assert.equal(partido.reporteEquipoA, null);
      assert.equal(partido.reporteEquipoB, null);
      assert.equal(partido.evidenciaBUrl, null);
      assert.equal(partido.estado, ESTADOS_PARTIDO.PENDIENTE);
      assert.equal(res.debeRevertirSiguientes, false);
    });

    it('indica que hay que seguir la cascada si el partido revertido estaba CONFIRMADO', () => {
      const res = confirmado({ ronda: 2 }).revertirSlot('B');

      assert.equal(res.debeRevertirSiguientes, true);
      assert.equal(res.ganadorPrevio, 'equipo-a');
      assert.equal(res.siguientePartidoId, 'partido-r2-1');
    });

    it('rechaza slots inválidos', () => {
      assert.throws(() => confirmado().revertirSlot('C'), ReglaDeNegocioError);
    });
  });

  describe('Byes y W.O.', () => {
    it('resuelve automáticamente un descanso (Bye) pendiente', () => {
      const partido = new Partido({
        ...partidoBase,
        equipoAId: 'equipo-bye',
        equipoBId: null,
        esBye: true,
        siguientePartidoId: 'partido-r2-cuartos',
        slotSiguiente: 'A'
      });

      const res = partido.resolverBye();

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-bye');
      assert.equal(res.avanza, true);
    });

    it('no permite resolver un Bye que ya está confirmado', () => {
      assert.throws(
        () => confirmado({ equipoBId: null, esBye: true }).resolverBye(),
        PartidoNoModificableError
      );
    });

    it('rechaza resolverBye si el partido no es un Bye', () => {
      const normal = new Partido({ ...partidoBase, equipoBId: null, esBye: false });
      assert.throws(() => normal.resolverBye(), ReglaDeNegocioError);
    });

    it('rechaza resolverBye si no hay equipo asignado en el Bye', () => {
      const byeSinEquipo = new Partido({ ...partidoBase, equipoAId: null, equipoBId: null, esBye: true });
      assert.throws(() => byeSinEquipo.resolverBye(), ReglaDeNegocioError);
    });

    it('declara victoria por W.O. sobre un partido EN_JUEGO', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });
      partido.declararVictoriaPorWO('equipo-a');

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-a');
    });

    it('no permite un W.O. que pise un resultado CONFIRMADO', () => {
      const partido = confirmado();

      assert.throws(() => partido.declararVictoriaPorWO('equipo-b'), PartidoNoModificableError);
      assert.equal(partido.ganadorId, 'equipo-a');
    });

    it('no permite W.O. en un partido PENDIENTE sin rival asignado', () => {
      const partido = new Partido({ ...partidoBase, equipoBId: null });

      assert.throws(() => partido.declararVictoriaPorWO('equipo-a'), PartidoNoModificableError);
    });
  });
});
