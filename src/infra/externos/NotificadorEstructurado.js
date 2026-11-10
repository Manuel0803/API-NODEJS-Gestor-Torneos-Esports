import { PuertoNotificador } from '../../dominio/puertos/index.js';
import { logger as loggerPorDefecto } from '../http/middlewares/contextoCorrelacion.js';

export class NotificadorEstructurado extends PuertoNotificador {
  constructor({ logger = loggerPorDefecto } = {}) {
    super();
    this.logger = logger;
  }

  async notificarProximoPartido(partido) {
    this.logger.info('Notificacion: proximo partido', {
      tipo: 'PROXIMO_PARTIDO',
      partidoId: partido.id,
      torneoId: partido.torneoId,
      equipoAId: partido.equipoAId,
      equipoBId: partido.equipoBId,
    });
  }

  async notificarCheckinPorVencer(torneo) {
    this.logger.info('Notificacion: check-in por vencer', {
      tipo: 'CHECKIN_POR_VENCER',
      torneoId: torneo.id,
      finCheckin: torneo.finCheckin,
    });
  }

  async notificarPartidoEnDisputa({ partidoId, reportadoPorEquipoId }) {
    this.logger.info('Notificacion: partido en disputa', {
      tipo: 'PARTIDO_EN_DISPUTA',
      partidoId,
      reportadoPorEquipoId,
    });
  }
}
