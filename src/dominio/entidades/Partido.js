import {
  PartidoNoModificableError,
  ReporteInvalidoError,
  ReglaDeNegocioError
} from '../errores/index.js';

export const ESTADOS_PARTIDO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_JUEGO: 'EN_JUEGO',
  EN_DISPUTA: 'EN_DISPUTA',
  CONFIRMADO: 'CONFIRMADO',
  ANULADO: 'ANULADO'
});

export const RESULTADOS_REPORTE = Object.freeze({
  GANA_A: 'GANA_A',
  GANA_B: 'GANA_B'
});

export class Partido {
  constructor({
    id,
    torneoId,
    ronda,
    posicionEnRonda,
    equipoAId = null,
    equipoBId = null,
    esBye = false,
    reporteEquipoA = null,
    reporteEquipoB = null,
    evidenciaAUrl = null,
    evidenciaBUrl = null,
    ganadorId = null,
    estado = ESTADOS_PARTIDO.PENDIENTE,
    siguientePartidoId = null,
    slotSiguiente = null,
    version = 1
  }) {
    if (!id || !torneoId || ronda === undefined || posicionEnRonda === undefined) {
      throw new ReglaDeNegocioError('id, torneoId, ronda y posicionEnRonda son obligatorios');
    }

    if (equipoAId && equipoBId && equipoAId === equipoBId) {
      throw new ReglaDeNegocioError('Un equipo no puede jugar contra sí mismo');
    }

    this.id = id;
    this.torneoId = torneoId;
    this.ronda = ronda;
    this.posicionEnRonda = posicionEnRonda;
    this.equipoAId = equipoAId;
    this.equipoBId = equipoBId;
    this.esBye = Boolean(esBye);
    this.reporteEquipoA = reporteEquipoA;
    this.reporteEquipoB = reporteEquipoB;
    this.evidenciaAUrl = evidenciaAUrl;
    this.evidenciaBUrl = evidenciaBUrl;
    this.ganadorId = ganadorId;
    this.estado = estado;
    this.siguientePartidoId = siguientePartidoId;
    this.slotSiguiente = slotSiguiente;
    this.version = version;
  }

  resolverBye() {
    if (!this.esBye) {
      throw new ReglaDeNegocioError(`El partido ${this.id} no es un Bye`);
    }

    const equipoGanador = this.equipoAId || this.equipoBId;
    if (!equipoGanador) {
      throw new ReglaDeNegocioError(`No hay equipo asignado para el Bye del partido ${this.id}`);
    }

    this.ganadorId = equipoGanador;
    this.estado = ESTADOS_PARTIDO.CONFIRMADO;

    return {
      partidoId: this.id,
      ganadorId: this.ganadorId,
      avanza: true,
      siguientePartidoId: this.siguientePartidoId,
      slotSiguiente: this.slotSiguiente
    };
  }

  asignarEquipo(slot, equipoId) {
    if (this.estado === ESTADOS_PARTIDO.CONFIRMADO || this.estado === ESTADOS_PARTIDO.ANULADO) {
      throw new PartidoNoModificableError(this.id, this.estado, 'asignarEquipo');
    }

    if (slot === 'A') {
      if (this.equipoBId && this.equipoBId === equipoId) {
        throw new ReglaDeNegocioError('El equipo ya está asignado al slot B');
      }
      this.equipoAId = equipoId;
    } else if (slot === 'B') {
      if (this.equipoAId && this.equipoAId === equipoId) {
        throw new ReglaDeNegocioError('El equipo ya está asignado al slot A');
      }
      this.equipoBId = equipoId;
    } else {
      throw new ReglaDeNegocioError(`Slot inválido: ${slot}`);
    }

    if (this.equipoAId && this.equipoBId && this.estado === ESTADOS_PARTIDO.PENDIENTE && !this.esBye) {
      this.estado = ESTADOS_PARTIDO.EN_JUEGO;
    }
  }

  registrarReporte({ equipoId, resultado, evidenciaUrl = null }) {
    if (this.estado !== ESTADOS_PARTIDO.EN_JUEGO && this.estado !== ESTADOS_PARTIDO.EN_DISPUTA) {
      throw new PartidoNoModificableError(this.id, this.estado, 'registrarReporte');
    }

    if (resultado !== RESULTADOS_REPORTE.GANA_A && resultado !== RESULTADOS_REPORTE.GANA_B) {
      throw new ReporteInvalidoError(`Resultado no reconocido: ${resultado}`);
    }

    const esEquipoA = this.equipoAId === equipoId;
    const esEquipoB = this.equipoBId === equipoId;

    if (!esEquipoA && !esEquipoB) {
      throw new ReporteInvalidoError(`El equipo ${equipoId} no pertenece al partido`, {
        partidoId: this.id,
        equipoId
      });
    }

    if (esEquipoA) {
      this.reporteEquipoA = resultado;
      if (evidenciaUrl) this.evidenciaAUrl = evidenciaUrl;
    } else {
      this.reporteEquipoB = resultado;
      if (evidenciaUrl) this.evidenciaBUrl = evidenciaUrl;
    }

    if (this.reporteEquipoA && this.reporteEquipoB) {
      const coinciden = this.reporteEquipoA === this.reporteEquipoB;

      if (coinciden) {
        this.estado = ESTADOS_PARTIDO.CONFIRMADO;
        this.ganadorId = this.reporteEquipoA === RESULTADOS_REPORTE.GANA_A ? this.equipoAId : this.equipoBId;
        return {
          estado: this.estado,
          ganadorId: this.ganadorId,
          enDisputa: false,
          confirmado: true,
          avanza: true,
          siguientePartidoId: this.siguientePartidoId,
          slotSiguiente: this.slotSiguiente
        };
      }

      this.estado = ESTADOS_PARTIDO.EN_DISPUTA;
      this.ganadorId = null;
      return {
        estado: this.estado,
        ganadorId: null,
        enDisputa: true,
        confirmado: false,
        avanza: false
      };
    }

    return {
      estado: this.estado,
      ganadorId: null,
      enDisputa: false,
      confirmado: false,
      avanza: false
    };
  }

  resolverDisputaArbitral({ ganadorId, motivo, arbitroId }) {
    if (this.estado !== ESTADOS_PARTIDO.EN_DISPUTA) {
      throw new PartidoNoModificableError(this.id, this.estado, 'resolverDisputaArbitral');
    }

    if (!arbitroId || !motivo) {
      throw new ReglaDeNegocioError('Se requiere arbitroId y motivo');
    }

    if (ganadorId !== this.equipoAId && ganadorId !== this.equipoBId) {
      throw new ReporteInvalidoError(`El ganador ${ganadorId} no pertenece al partido`);
    }

    this.ganadorId = ganadorId;
    this.estado = ESTADOS_PARTIDO.CONFIRMADO;

    return {
      partidoId: this.id,
      ganadorId: this.ganadorId,
      arbitroId,
      motivo,
      siguientePartidoId: this.siguientePartidoId,
      slotSiguiente: this.slotSiguiente,
      avanza: true
    };
  }

  declararVictoriaPorWO(ganadorId, motivo = 'Rival ausente en check-in (W.O.)') {
    if (ganadorId !== this.equipoAId && ganadorId !== this.equipoBId) {
      throw new ReporteInvalidoError(`El ganador por W.O. ${ganadorId} no pertenece al partido`);
    }

    this.ganadorId = ganadorId;
    this.estado = ESTADOS_PARTIDO.CONFIRMADO;

    return {
      partidoId: this.id,
      ganadorId: this.ganadorId,
      motivo,
      siguientePartidoId: this.siguientePartidoId,
      slotSiguiente: this.slotSiguiente,
      avanza: true
    };
  }

  anularPorArbitro({ arbitroId, motivo }) {
    if (this.estado !== ESTADOS_PARTIDO.CONFIRMADO && this.estado !== ESTADOS_PARTIDO.EN_DISPUTA) {
      throw new PartidoNoModificableError(this.id, this.estado, 'anularPorArbitro');
    }

    if (!arbitroId || !motivo) {
      throw new ReglaDeNegocioError('Se requiere arbitroId y motivo');
    }

    const ganadorPrevio = this.ganadorId;
    this.estado = ESTADOS_PARTIDO.ANULADO;
    this.ganadorId = null;

    return {
      partidoId: this.id,
      arbitroId,
      motivo,
      ganadorPrevio,
      siguientePartidoId: this.siguientePartidoId,
      slotSiguiente: this.slotSiguiente
    };
  }

  revertirSlot(slot) {
    if (slot === 'A') {
      this.equipoAId = null;
      this.reporteEquipoA = null;
      this.evidenciaAUrl = null;
    } else if (slot === 'B') {
      this.equipoBId = null;
      this.reporteEquipoB = null;
      this.evidenciaBUrl = null;
    }

    const estabaConfirmado = this.estado === ESTADOS_PARTIDO.CONFIRMADO;
    const ganadorPrevio = this.ganadorId;

    this.ganadorId = null;
    this.estado = ESTADOS_PARTIDO.PENDIENTE;

    return {
      partidoId: this.id,
      debeRevertirSiguientes: estabaConfirmado,
      ganadorPrevio,
      siguientePartidoId: this.siguientePartidoId,
      slotSiguiente: this.slotSiguiente
    };
  }
}
