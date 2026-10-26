import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Partido,
  ESTADOS_PARTIDO,
  RESULTADOS_REPORTE
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

  it('no permite que un equipo juegue contra sí mismo', () => {
    assert.throws(
      () => new Partido({ ...partidoBase, equipoAId: 'equipo-x', equipoBId: 'equipo-x' }),
      ReglaDeNegocioError
    );
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
      assert.equal(res.enDisputa, false);
      assert.equal(res.avanza, true);
      assert.equal(res.siguientePartidoId, 'partido-r2-1');
      assert.equal(res.slotSiguiente, 'A');
    });

    it('pasa a CONFIRMADO automáticamente cuando ambos reportes coinciden (GANA_B)', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      partido.registrarReporte({ equipoId: 'equipo-a', resultado: RESULTADOS_REPORTE.GANA_B });
      const res = partido.registrarReporte({ equipoId: 'equipo-b', resultado: RESULTADOS_REPORTE.GANA_B });

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-b');
      assert.equal(res.confirmado, true);
    });

    it('pasa a EN_DISPUTA si los dos capitanes reportan resultados contradictorios', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.EN_JUEGO });

      partido.registrarReporte({ equipoId: 'equipo-a', resultado: RESULTADOS_REPORTE.GANA_A });
      const res = partido.registrarReporte({ equipoId: 'equipo-b', resultado: RESULTADOS_REPORTE.GANA_B });

      assert.equal(partido.estado, ESTADOS_PARTIDO.EN_DISPUTA);
      assert.equal(partido.ganadorId, null);
      assert.equal(res.confirmado, false);
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
  });

  describe('Anulación arbitral y preparación de cascada', () => {
    it('anula un partido confirmado reseteando el ganador y retornando datos para cascada', () => {
      const partido = new Partido({
        ...partidoBase,
        estado: ESTADOS_PARTIDO.CONFIRMADO,
        ganadorId: 'equipo-a',
        siguientePartidoId: 'partido-r2-1',
        slotSiguiente: 'A'
      });

      const res = partido.anularPorArbitro({
        arbitroId: 'arbitro-1',
        motivo: 'Trampa comprobada por uso de software no autorizado'
      });

      assert.equal(partido.estado, ESTADOS_PARTIDO.ANULADO);
      assert.equal(partido.ganadorId, null);
      assert.equal(res.ganadorPrevio, 'equipo-a');
      assert.equal(res.siguientePartidoId, 'partido-r2-1');
      assert.equal(res.slotSiguiente, 'A');
    });

    it('revertirSlot limpia el equipo del slot y resetea el partido a PENDIENTE', () => {
      const partido = new Partido({
        ...partidoBase,
        estado: ESTADOS_PARTIDO.EN_JUEGO
      });

      const res = partido.revertirSlot('A');

      assert.equal(partido.equipoAId, null);
      assert.equal(partido.equipoBId, 'equipo-b');
      assert.equal(partido.estado, ESTADOS_PARTIDO.PENDIENTE);
      assert.equal(res.debeRevertirSiguientes, false);
    });
  });

  describe('Manejo de Byes y W.O.', () => {
    it('resuelve automáticamente un descanso (Bye)', () => {
      const partido = new Partido({
        ...partidoBase,
        equipoAId: 'equipo-bye',
        equipoBId: null,
        esBye: true,
        estado: ESTADOS_PARTIDO.PENDIENTE,
        siguientePartidoId: 'partido-r2-cuartos',
        slotSiguiente: 'A'
      });

      const res = partido.resolverBye();

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-bye');
      assert.equal(res.avanza, true);
    });

    it('declara victoria por W.O. cuando rival no se presenta', () => {
      const partido = new Partido({ ...partidoBase, estado: ESTADOS_PARTIDO.PENDIENTE });
      partido.declararVictoriaPorWO('equipo-a', 'Rival ausente en check-in');

      assert.equal(partido.estado, ESTADOS_PARTIDO.CONFIRMADO);
      assert.equal(partido.ganadorId, 'equipo-a');
    });
  });
});
