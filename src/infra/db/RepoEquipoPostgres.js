import { Equipo } from '../../dominio/entidades/Equipo.js';

export class RepoEquipoPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async obtenerPorId(id) {
    const res = await this.db.query('SELECT * FROM equipos WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async guardar(equipo) {
    await this.db.query(
      `INSERT INTO equipos (id, nombre, capitan_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
      [equipo.id, equipo.nombre, equipo.capitanId],
    );
  }

  #mapearEntidad(fila) {
    return new Equipo({
      id: fila.id,
      nombre: fila.nombre,
      capitanId: fila.capitan_id
    });
  }
}