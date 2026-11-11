import { PuertoNotificador } from '../../dominio/puertos/index.js';

export const TIPOS_NOTIFICACION = Object.freeze({
  PROXIMO_PARTIDO: 'PROXIMO_PARTIDO',
  CHECKIN_POR_VENCER: 'CHECKIN_POR_VENCER',
  PARTIDO_EN_DISPUTA: 'PARTIDO_EN_DISPUTA',
});

export class NotificadorMemoria extends PuertoNotificador {
  constructor() {
    super();
    this.notificaciones = [];
  }

  async notificarProximoPartido(partido) {
    this.notificaciones.push({
      tipo: TIPOS_NOTIFICACION.PROXIMO_PARTIDO,
      partidoId: partido.id,
      torneoId: partido.torneoId,
      equipoAId: partido.equipoAId,
      equipoBId: partido.equipoBId,
    });
  }

  async notificarCheckinPorVencer(torneo) {
    this.notificaciones.push({
      tipo: TIPOS_NOTIFICACION.CHECKIN_POR_VENCER,
      torneoId: torneo.id,
      finCheckin: torneo.finCheckin,
    });
  }

  async notificarPartidoEnDisputa({ partidoId, reportadoPorEquipoId }) {
    this.notificaciones.push({
      tipo: TIPOS_NOTIFICACION.PARTIDO_EN_DISPUTA,
      partidoId,
      reportadoPorEquipoId,
    });
  }
}

