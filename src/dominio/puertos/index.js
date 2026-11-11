export class PuertoUnidadDeTrabajo {
  async ejecutar(_trabajo) {
    throw new Error('PuertoUnidadDeTrabajo.ejecutar debe ser implementado por el adaptador');
  }
}

export class PuertoReloj {
  ahora() {
    throw new Error('PuertoReloj.ahora debe ser implementado por el adaptador');
  }
}

export class PuertoProveedorIdentidad {
  async verificarJugadores(_jugadoresIds) {
    throw new Error('PuertoProveedorIdentidad.verificarJugadores debe ser implementado por el adaptador');
  }
}

export class PuertoAlmacenEvidencias {
  async registrarEvidencia(_datosEvidencia) {
    throw new Error('PuertoAlmacenEvidencias.registrarEvidencia debe ser implementado por el adaptador');
  }
}

export class PuertoNotificador {
  async notificarProximoPartido(_partido) {
    throw new Error('PuertoNotificador.notificarProximoPartido debe ser implementado por el adaptador');
  }

  async notificarCheckinPorVencer(_torneo) {
    throw new Error('PuertoNotificador.notificarCheckinPorVencer debe ser implementado por el adaptador');
  }

  async notificarPartidoEnDisputa(_datosDisputa) {
    throw new Error('PuertoNotificador.notificarPartidoEnDisputa debe ser implementado por el adaptador');
  }
}

