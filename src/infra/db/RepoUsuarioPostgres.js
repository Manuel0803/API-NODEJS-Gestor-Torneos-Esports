import { Usuario } from '../../dominio/entidades/Usuario.js';

export class RepoUsuarioPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async obtenerPorId(id) {
    const res = await this.db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async obtenerPorEmail(email) {
    const res = await this.db.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async guardar(usuario) {
    const query = `
      INSERT INTO usuarios (id, email, password_hash, nombre_usuario, gamer_tag, rol, puntos_elo, creado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        gamer_tag = EXCLUDED.gamer_tag,
        puntos_elo = EXCLUDED.puntos_elo
    `;
    const params = [
      usuario.id, usuario.email, usuario.passwordHash, usuario.nombreUsuario, 
      usuario.gamerTag, usuario.rol, usuario.puntosElo, usuario.creadoEn
    ];
    await this.db.query(query, params);
  }

  #mapearEntidad(fila) {
    return new Usuario({
      id: fila.id,
      email: fila.email,
      passwordHash: fila.password_hash,
      nombreUsuario: fila.nombre_usuario,
      gamerTag: fila.gamer_tag,
      rol: fila.rol,
      puntosElo: fila.puntos_elo,
      creadoEn: fila.creado_en
    });
  }
}