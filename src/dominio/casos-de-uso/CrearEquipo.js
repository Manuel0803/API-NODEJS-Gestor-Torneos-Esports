import { randomUUID } from 'node:crypto';
import { ReglaDeNegocioError } from '../errores/index.js';
import { Equipo } from '../entidades/Equipo.js';

export class CrearEquipo {
  constructor({ unidadDeTrabajo }) {
    this.unidadDeTrabajo = unidadDeTrabajo;
  }

  async ejecutar({ nombre, capitanId }) {
    return this.unidadDeTrabajo.ejecutar(async ({ equipos }) => {
      const equipo = new Equipo({ id: randomUUID(), nombre, capitanId });

      const existente = await equipos.obtenerPorNombre(equipo.nombre);
      if (existente) {
        throw new ReglaDeNegocioError('Ya existe un equipo con ese nombre', { nombre: equipo.nombre });
      }

      await equipos.guardar(equipo);
      return equipo;
    });
  }
}
