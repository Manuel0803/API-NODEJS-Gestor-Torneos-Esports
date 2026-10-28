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

    if (!Object.values(ESTADOS_INSCRIPCION).includes(estado)) {
      throw new ReglaDeNegocioError(`Estado de inscripción inválido: ${estado}`);
    }

    if (!Number.isInteger(Number(ordenInscripcion)) || ordenInscripcion < 1) {
      throw new ReglaDeNegocioError('El orden de inscripción debe ser un entero positivo');
    }

    if (estado === ESTADOS_INSCRIPCION.ELIMINADO_WO && checkinConfirmado) {
      throw new ReglaDeNegocioError('Un equipo eliminado por W.O. no puede tener el check-in confirmado');
    }

    const jugadores = Array.isArray(jugadoresIds) ? [...jugadoresIds] : [];
    if (new Set(jugadores).size !== jugadores.length) {
      throw new ReglaDeNegocioError('La nómina del equipo contiene jugadores repetidos');
    }

    this.id = id;
    this.torneoId = torneoId;
    this.equipoId = equipoId;
    this.checkinConfirmado = Boolean(checkinConfirmado);
    this.estado = estado;
    this.ordenInscripcion = Number(ordenInscripcion);
    this.jugadoresIds = jugadores;
    this.creadoEn = creadoEn instanceof Date ? creadoEn : new Date(creadoEn);
  }

  confirmarCheckin() {
    if (this.estado === ESTADOS_INSCRIPCION.ELIMINADO_WO) {
      throw new ReglaDeNegocioError('No se puede confirmar check-in de equipo eliminado por W.O.');
    }
    this.checkinConfirmado = true;
  }

  eliminarPorWO() {
    if (this.checkinConfirmado) {
      throw new ReglaDeNegocioError('No se puede eliminar por W.O. a un equipo que confirmó su presencia');
    }
    this.estado = ESTADOS_INSCRIPCION.ELIMINADO_WO;
  }

  participaDelSorteo() {
    return this.estado === ESTADOS_INSCRIPCION.CONFIRMADA && this.checkinConfirmado;
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
