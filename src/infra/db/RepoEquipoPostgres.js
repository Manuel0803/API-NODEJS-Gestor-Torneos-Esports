import { Equipo } from '../../dominio/entidades/Equipo.js';
import { ReglaDeNegocioError } from '../../dominio/errores/index.js';

export class RepoEquipoPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async obtenerPorId(id) {
    const res = await this.db.query('SELECT * FROM equipos WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async obtenerPorNombre(nombre) {
    const res = await this.db.query('SELECT * FROM equipos WHERE nombre = $1', [nombre]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async obtenerPorCapitan(capitanId) {
    const res = await this.db.query(
      'SELECT * FROM equipos WHERE capitan_id = $1 ORDER BY nombre ASC',
      [capitanId],
    );
    return res.rows.map((fila) => this.#mapearEntidad(fila));
  }

  async guardar(equipo) {
    try {
      await this.db.query(
        `INSERT INTO equipos (id, nombre, capitan_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
        [equipo.id, equipo.nombre, equipo.capitanId],
      );
    } catch (error) {
      if (error.code === '23505') {
        throw new ReglaDeNegocioError('Ya existe un equipo con ese nombre', { nombre: equipo.nombre });
      }
      throw error;
    }
  }

  #mapearEntidad(fila) {
    return new Equipo({
      id: fila.id,
      nombre: fila.nombre,
      capitanId: fila.capitan_id
    });
  }
}