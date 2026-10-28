export class ErrorDeDominio extends Error {
  constructor(mensaje, detalles = {}) {
    super(mensaje);
    this.name = this.constructor.name;
    this.detalles = detalles;
  }
}

export class EntidadNoEncontradaError extends ErrorDeDominio {
  constructor(entidad, id) {
    super(`No se encontró ${entidad} con id: ${id}`, { entidad, id });
  }
}

export class CupoAgotadoError extends ErrorDeDominio {
  constructor(torneoId, cupoMaximo) {
    super(`Cupo máximo de ${cupoMaximo} equipos alcanzado`, { torneoId, cupoMaximo });
  }
}

export class TorneoCerradoError extends ErrorDeDominio {
  constructor(motivo) {
    super(`Operación no permitida: ${motivo}`, { motivo });
  }
}

export class JugadorYaInscriptoError extends ErrorDeDominio {
  constructor(jugadorId, torneoId) {
    super(`El jugador ${jugadorId} ya está inscripto en este torneo`, { jugadorId, torneoId });
  }
}

export class CheckinFueraDeVentanaError extends ErrorDeDominio {
  constructor(mensaje, ventana) {
    super(mensaje, { ventana });
  }
}

export class PartidoNoModificableError extends ErrorDeDominio {
  constructor(partidoId, estadoActual, accion) {
    super(`No se puede ejecutar '${accion}' en partido ${partidoId} con estado '${estadoActual}'`, {
      partidoId,
      estadoActual,
      accion
    });
  }
}

export class ReporteInvalidoError extends ErrorDeDominio {
  constructor(mensaje, detalles = {}) {
    super(mensaje, detalles);
  }
}

export class PermisoDenegadoError extends ErrorDeDominio {
  constructor(mensaje = 'Permiso denegado para esta operación') {
    super(mensaje);
  }
}

export class ReglaDeNegocioError extends ErrorDeDominio {
  constructor(mensaje, detalles = {}) {
    super(mensaje, detalles);
  }
}
