import { PuertoAlmacenEvidencias } from '../../dominio/puertos/index.js';
import {
  ReporteInvalidoError,
  ServicioExternoNoDisponibleError,
} from '../../dominio/errores/index.js';
import { postJson, normalizarBaseUrl } from './clienteHttpJson.js';

const SERVICIO = 'AlmacenEvidenciasDjango';

function esUrlHttp(valor) {
  if (typeof valor !== 'string') return false;
  try {
    const url = new URL(valor.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class AlmacenEvidenciasHttp extends PuertoAlmacenEvidencias {
  constructor({ baseUrl, timeoutMs, fetchFn = fetch }) {
    super();
    this.baseUrl = normalizarBaseUrl(baseUrl);
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
  }

  async registrarEvidencia({ partidoId, equipoId, evidenciaUrl }) {
    if (!esUrlHttp(evidenciaUrl)) {
      throw new ReporteInvalidoError('La URL de la captura de evidencia no es válida', { evidenciaUrl });
    }

    const { status, datos } = await postJson({
      fetchFn: this.fetchFn,
      url: `${this.baseUrl}/evidencias`,
      cuerpo: { partidoId, equipoId, evidenciaUrl: evidenciaUrl.trim() },
      timeoutMs: this.timeoutMs,
      servicio: SERVICIO,
    });

    if (status === 400 || status === 422) {
      throw new ReporteInvalidoError('El servicio de evidencias rechazó la captura', { evidenciaUrl });
    }

    if ((status !== 200 && status !== 201) || typeof datos?.url !== 'string') {
      throw new ServicioExternoNoDisponibleError(SERVICIO, `Respuesta inesperada (${status})`);
    }

    return { partidoId, equipoId, url: datos.url, registradoEn: new Date() };
  }
}
