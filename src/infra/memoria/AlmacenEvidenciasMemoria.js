import { PuertoAlmacenEvidencias } from '../../dominio/puertos/index.js';
import {
  ReporteInvalidoError,
  ServicioExternoNoDisponibleError,
} from '../../dominio/errores/index.js';

export class AlmacenEvidenciasMemoria extends PuertoAlmacenEvidencias {
  constructor({ disponible = true } = {}) {
    super();
    this.disponible = disponible;
    this.evidencias = new Map();
  }

  simularCaida(caido = true) {
    this.disponible = !caido;
  }

  async registrarEvidencia({ partidoId, equipoId, evidenciaUrl }) {
    if (!this.disponible) {
      throw new ServicioExternoNoDisponibleError('AlmacenEvidenciasDjango', 'Timeout o servicio caído');
    }

    if (typeof evidenciaUrl !== 'string' || !evidenciaUrl.trim().startsWith('http')) {
      throw new ReporteInvalidoError('La URL de la captura de evidencia no es válida', { evidenciaUrl });
    }

    const clave = `${partidoId}:${equipoId}`;
    const registro = {
      partidoId,
      equipoId,
      url: evidenciaUrl.trim(),
      registradoEn: new Date(),
    };
    this.evidencias.set(clave, registro);
    return registro;
  }
}

