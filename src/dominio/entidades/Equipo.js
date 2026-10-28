import { ReglaDeNegocioError } from '../errores/index.js';

export class Equipo {
  constructor({ id, nombre, capitanId }) {
    if (!id || !nombre || !capitanId) {
      throw new ReglaDeNegocioError('id, nombre y capitanId son obligatorios');
    }

    if (nombre.trim().length < 3) {
      throw new ReglaDeNegocioError('El nombre del equipo debe tener al menos 3 caracteres');
    }

    this.id = id;
    this.nombre = nombre.trim();
    this.capitanId = capitanId;
  }

  esCapitan(usuarioId) {
    return this.capitanId === usuarioId;
  }
}
