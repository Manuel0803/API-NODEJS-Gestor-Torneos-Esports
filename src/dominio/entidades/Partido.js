import {
  PartidoNoModificableError,
  ReporteInvalidoError,
  ReglaDeNegocioError
} from '../errores/index.js';

export const ESTADOS_PARTIDO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_JUEGO: 'EN_JUEGO',
  EN_DISPUTA: 'EN_DISPUTA',
  CONFIRMADO: 'CONFIRMADO'
});

export const RESULTADOS_REPORTE = Object.freeze({
  GANA_A: 'GANA_A',
  GANA_B: 'GANA_B'
});

export const RESOLUCIONES_ANULACION = Object.freeze({
  REJUGAR: 'REJUGAR',
  VICTORIA_ADMINISTRATIVA: 'VICTORIA_ADMINISTRATIVA'
});

const SLOTS = Object.freeze(['A', 'B']);

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

    if (!Object.values(ESTADOS_PARTIDO).includes(estado)) {
      throw new ReglaDeNegocioError(`Estado de partido inválido: ${estado}`);
    }

    if (slotSiguiente !== null && !SLOTS.includes(slotSiguiente)) {
      throw new ReglaDeNegocioError(`Slot siguiente inválido: ${slotSiguiente}`);
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
    this.#exigirEstado('resolverBye', ESTADOS_PARTIDO.PENDIENTE);

    if (!this.esBye) {
      throw new ReglaDeNegocioError(`El partido ${this.id} no es un Bye`);
    }

    const equipoGanador = this.equipoAId || this.equipoBId;
    if (!equipoGanador) {
      throw new ReglaDeNegocioError(`No hay equipo asignado para el Bye del partido ${this.id}`);
    }

    this.ganadorId = equipoGanador;
    this.estado = ESTADOS_PARTIDO.CONFIRMADO;

    return this.#datosDeAvance();
  }

  asignarEquipo(slot, equipoId) {
    this.#exigirEstado('asignarEquipo', ESTADOS_PARTIDO.PENDIENTE);
    this.#exigirSlotValido(slot);

    if (this.esBye) {
      throw new ReglaDeNegocioError('No se pueden asignar equipos a un partido de descanso (Bye)');
    }

    const rival = slot === 'A' ? this.equipoBId : this.equipoAId;
    if (rival && rival === equipoId) {
      throw new ReglaDeNegocioError(`El equipo ya está asignado al slot ${slot === 'A' ? 'B' : 'A'}`);
    }

    if (slot === 'A') {
      this.equipoAId = equipoId;
    } else {
      this.equipoBId = equipoId;
    }

    if (this.equipoAId && this.equipoBId) {
      this.estado = ESTADOS_PARTIDO.EN_JUEGO;
    }
  }

  registrarReporte({ equipoId, resultado, evidenciaUrl = null }) {
    this.#exigirEstado('registrarReporte', ESTADOS_PARTIDO.EN_JUEGO);

    if (!Object.values(RESULTADOS_REPORTE).includes(resultado)) {
      throw new ReporteInvalidoError(`Resultado no reconocido: ${resultado}`);
    }

    this.#exigirEquipoDelPartido(equipoId);

    if (equipoId === this.equipoAId) {
      this.reporteEquipoA = resultado;
      if (evidenciaUrl) this.evidenciaAUrl = evidenciaUrl;
    } else {
      this.reporteEquipoB = resultado;
      if (evidenciaUrl) this.evidenciaBUrl = evidenciaUrl;
    }

    if (!this.reporteEquipoA || !this.reporteEquipoB) {
      return { estado: this.estado, ganadorId: null, enDisputa: false, confirmado: false, avanza: false };
    }

    if (this.reporteEquipoA !== this.reporteEquipoB) {
      this.estado = ESTADOS_PARTIDO.EN_DISPUTA;
      this.ganadorId = null;
      return { estado: this.estado, ganadorId: null, enDisputa: true, confirmado: false, avanza: false };
    }

    this.estado = ESTADOS_PARTIDO.CONFIRMADO;
    this.ganadorId = this.reporteEquipoA === RESULTADOS_REPORTE.GANA_A ? this.equipoAId : this.equipoBId;

    return {
      estado: this.estado,
      enDisputa: false,
      confirmado: true,
      ...this.#datosDeAvance()
    };
  }

  resolverDisputaArbitral({ ganadorId, motivo, arbitroId }) {
    this.#exigirEstado('resolverDisputaArbitral', ESTADOS_PARTIDO.EN_DISPUTA);
    this.#exigirArbitroYMotivo(arbitroId, motivo);
    this.#exigirEquipoDelPartido(ganadorId);

    this.ganadorId = ganadorId;
    this.estado = ESTADOS_PARTIDO.CONFIRMADO;

    return { arbitroId, motivo, ...this.#datosDeAvance() };
  }

  declararVictoriaPorWO(ganadorId, motivo = 'El rival no se presentó a disputar el partido') {
    this.#exigirEstado('declararVictoriaPorWO', ESTADOS_PARTIDO.EN_JUEGO);
    this.#exigirEquipoDelPartido(ganadorId);

    this.ganadorId = ganadorId;
    this.estado = ESTADOS_PARTIDO.CONFIRMADO;

    return { motivo, ...this.#datosDeAvance() };
  }

  anularPorArbitro({ arbitroId, motivo, resolucion, ganadorId = null }) {
    this.#exigirEstado('anularPorArbitro', ESTADOS_PARTIDO.CONFIRMADO, ESTADOS_PARTIDO.EN_DISPUTA);
    this.#exigirArbitroYMotivo(arbitroId, motivo);

    if (this.esBye) {
      throw new ReglaDeNegocioError('Un partido de descanso (Bye) no se puede anular');
    }

    if (!Object.values(RESOLUCIONES_ANULACION).includes(resolucion)) {
      throw new ReglaDeNegocioError(`Resolución de anulación inválida: ${resolucion}`);
    }

    const estadoAnterior = this.#capturarEstado();

    if (resolucion === RESOLUCIONES_ANULACION.REJUGAR) {
      this.#limpiarReportes();
      this.ganadorId = null;
      this.estado = ESTADOS_PARTIDO.EN_JUEGO;
    } else {
      this.#exigirEquipoDelPartido(ganadorId);
      this.ganadorId = ganadorId;
      this.estado = ESTADOS_PARTIDO.CONFIRMADO;
    }

    const avanzoAlguien = estadoAnterior.estado === ESTADOS_PARTIDO.CONFIRMADO;

    return {
      partidoId: this.id,
      arbitroId,
      motivo,
      resolucion,
      estadoAnterior,
      ganadorPrevio: estadoAnterior.ganadorId,
      ganadorId: this.ganadorId,
      debeRevertirSiguiente: avanzoAlguien && estadoAnterior.ganadorId !== this.ganadorId,
      avanza: this.estado === ESTADOS_PARTIDO.CONFIRMADO && estadoAnterior.ganadorId !== this.ganadorId,
      siguientePartidoId: this.siguientePartidoId,
      slotSiguiente: this.slotSiguiente
    };
  }

  revertirSlot(slot) {
    this.#exigirSlotValido(slot);

    if (slot === 'A') {
      this.equipoAId = null;
    } else {
      this.equipoBId = null;
    }

    const estabaConfirmado = this.estado === ESTADOS_PARTIDO.CONFIRMADO;
    const ganadorPrevio = this.ganadorId;

    this.#limpiarReportes();
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

  #exigirEstado(accion, ...estadosPermitidos) {
    if (!estadosPermitidos.includes(this.estado)) {
      throw new PartidoNoModificableError(this.id, this.estado, accion);
    }
  }

  #exigirSlotValido(slot) {
    if (!SLOTS.includes(slot)) {
      throw new ReglaDeNegocioError(`Slot inválido: ${slot}`);
    }
  }

  #exigirEquipoDelPartido(equipoId) {
    if (!equipoId || (equipoId !== this.equipoAId && equipoId !== this.equipoBId)) {
      throw new ReporteInvalidoError(`El equipo ${equipoId} no pertenece al partido`, {
        partidoId: this.id,
        equipoId
      });
    }
  }

  #exigirArbitroYMotivo(arbitroId, motivo) {
    if (!arbitroId || !motivo) {
      throw new ReglaDeNegocioError('Se requiere arbitroId y motivo');
    }
  }

  #limpiarReportes() {
    this.reporteEquipoA = null;
    this.reporteEquipoB = null;
    this.evidenciaAUrl = null;
    this.evidenciaBUrl = null;
  }

  #capturarEstado() {
    return {
      estado: this.estado,
      ganadorId: this.ganadorId,
      reporteEquipoA: this.reporteEquipoA,
      reporteEquipoB: this.reporteEquipoB,
      evidenciaAUrl: this.evidenciaAUrl,
      evidenciaBUrl: this.evidenciaBUrl
    };
  }

  #datosDeAvance() {
    return {
      partidoId: this.id,
      ganadorId: this.ganadorId,
      avanza: true,
      siguientePartidoId: this.siguientePartidoId,
      slotSiguiente: this.slotSiguiente
    };
  }
}
