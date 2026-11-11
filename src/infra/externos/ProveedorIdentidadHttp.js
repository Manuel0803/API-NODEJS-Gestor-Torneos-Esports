import { PuertoProveedorIdentidad } from '../../dominio/puertos/index.js';
import {
  ReglaDeNegocioError,
  ServicioExternoNoDisponibleError,
} from '../../dominio/errores/index.js';
import { postJson, normalizarBaseUrl } from './clienteHttpJson.js';

const SERVICIO = 'ProveedorIdentidadDjango';

export class ProveedorIdentidadHttp extends PuertoProveedorIdentidad {
  constructor({ baseUrl, timeoutMs, fetchFn = fetch }) {
    super();
    this.baseUrl = normalizarBaseUrl(baseUrl);
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
  }

  async verificarJugadores(jugadoresIds) {
    const { status, datos } = await postJson({
      fetchFn: this.fetchFn,
      url: `${this.baseUrl}/identidad/verificar`,
      cuerpo: { jugadoresIds },
      timeoutMs: this.timeoutMs,
      servicio: SERVICIO,
    });

    if (status !== 200 || !Array.isArray(datos?.invalidos)) {
      throw new ServicioExternoNoDisponibleError(SERVICIO, `Respuesta inesperada (${status})`);
    }

    if (datos.invalidos.length > 0) {
      throw new ReglaDeNegocioError(
        `Los jugadores '${datos.invalidos.join("', '")}' no poseen una identidad válida en el servidor del juego`,
        { jugadoresInvalidos: datos.invalidos },
      );
    }

    return true;
  }
}
