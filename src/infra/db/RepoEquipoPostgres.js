import { Equipo } from '../../dominio/entidades/Equipo.js';

export class RepoEquipoPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async obtenerPorId(id) {
    const res = await this.db.query('SELECT * FROM equipos WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return new Equipo({
      id: res.rows[0].id,
      nombre: res.rows[0].nombre,
      capitanId: res.rows[0].capitan_id
    });
  }

  async guardar(equipo) {
    const query = `
      INSERT INTO equipos (id, nombre, capitan_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        capitan_id = EXCLUDED.capitan_id
    `;
    await this.db.query(query, [equipo.id, equipo.nombre, equipo.capitanId]);
  }
}