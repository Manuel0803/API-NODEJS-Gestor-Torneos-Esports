import { PuertoProveedorIdentidad } from '../../dominio/puertos/index.js';
import {
  ReglaDeNegocioError,
  ServicioExternoNoDisponibleError,
} from '../../dominio/errores/index.js';

export class ProveedorIdentidadMemoria extends PuertoProveedorIdentidad {
  constructor({ jugadoresInvalidos = [], disponible = true } = {}) {
    super();
    this.jugadoresInvalidos = new Set(jugadoresInvalidos);
    this.disponible = disponible;
  }

  simularCaida(caido = true) {
    this.disponible = !caido;
  }

  marcarJugadorInvalido(jugadorId) {
    this.jugadoresInvalidos.add(jugadorId);
  }

  async verificarJugadores(jugadoresIds) {
    if (!this.disponible) {
      throw new ServicioExternoNoDisponibleError('ProveedorIdentidadDjango', 'Timeout o servicio caído');
    }

    for (const jugadorId of jugadoresIds) {
      if (this.jugadoresInvalidos.has(jugadorId)) {
        throw new ReglaDeNegocioError(
          `El jugador '${jugadorId}' no posee una identidad válida en el servidor del juego`,
          { jugadorId },
        );
      }
    }

    return true;
  }
}

