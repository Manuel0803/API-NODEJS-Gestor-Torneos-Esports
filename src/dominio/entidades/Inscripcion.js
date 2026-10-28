import { ReglaDeNegocioError } from '../errores/index.js';

export const ESTADOS_INSCRIPCION = Object.freeze({
  CONFIRMADA: 'CONFIRMADA',
  ELIMINADO_WO: 'ELIMINADO_WO'
});

export class Inscripcion {
  constructor({
    id,
    torneoId,
    equipoId,
    checkinConfirmado = false,
    estado = ESTADOS_INSCRIPCION.CONFIRMADA,
    ordenInscripcion,
    jugadoresIds = [],
    creadoEn = new Date()
  }) {
    if (!id || !torneoId || !equipoId || ordenInscripcion === undefined) {
      throw new ReglaDeNegocioError('id, torneoId, equipoId y ordenInscripcion son obligatorios');
    }

    this.id = id;
    this.torneoId = torneoId;
    this.equipoId = equipoId;
    this.checkinConfirmado = Boolean(checkinConfirmado);
    this.estado = estado;
    this.ordenInscripcion = Number(ordenInscripcion);
    this.jugadoresIds = Array.isArray(jugadoresIds) ? [...jugadoresIds] : [];
    this.creadoEn = creadoEn instanceof Date ? creadoEn : new Date(creadoEn);
  }

  confirmarCheckin() {
    if (this.estado === ESTADOS_INSCRIPCION.ELIMINADO_WO) {
      throw new ReglaDeNegocioError('No se puede confirmar check-in de equipo eliminado por W.O.');
    }
    this.checkinConfirmado = true;
  }

  eliminarPorWO() {
    this.estado = ESTADOS_INSCRIPCION.ELIMINADO_WO;
    this.checkinConfirmado = false;
  }

  contieneJugador(jugadorId) {
    return this.jugadoresIds.includes(jugadorId);
  }

  validarTamano(tamanoRequerido) {
    if (this.jugadoresIds.length !== tamanoRequerido) {
      throw new ReglaDeNegocioError(
        `Se esperaban ${tamanoRequerido} jugadores y hay ${this.jugadoresIds.length}`
      );
    }
  }
}
