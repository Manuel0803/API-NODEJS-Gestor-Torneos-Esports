import { Inscripcion } from '../../dominio/entidades/Inscripcion.js';

export class RepoInscripcionPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async guardar(inscripcion) {
    await this.db.query(
      `INSERT INTO inscripciones (
         id, torneo_id, equipo_id, checkin_confirmado, estado, orden_inscripcion, creado_en
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         checkin_confirmado = EXCLUDED.checkin_confirmado,
         estado = EXCLUDED.estado`,
      [
        inscripcion.id, inscripcion.torneoId, inscripcion.equipoId,
        inscripcion.checkinConfirmado, inscripcion.estado,
        inscripcion.ordenInscripcion, inscripcion.creadoEn
      ],
    );
    for (const jugadorId of inscripcion.jugadoresIds) {
      await this.db.query(
        `INSERT INTO inscripcion_jugadores (inscripcion_id, torneo_id, jugador_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (inscripcion_id, jugador_id) DO NOTHING`,
        [inscripcion.id, inscripcion.torneoId, jugadorId],
      );
    }
  }

  async obtenerPorId(id) {
    const res = await this.db.query('SELECT * FROM inscripciones WHERE id = $1', [id]);
    const [inscripcion] = await this.#mapearFilas(res.rows);
    return inscripcion ?? null;
  }

  async obtenerPorTorneoYEquipo(torneoId, equipoId) {
    const res = await this.db.query(
      'SELECT * FROM inscripciones WHERE torneo_id = $1 AND equipo_id = $2',
      [torneoId, equipoId],
    );
    const [inscripcion] = await this.#mapearFilas(res.rows);
    return inscripcion ?? null;
  }

  async jugadorYaInscriptoEnTorneo(torneoId, jugadorId) {
    const res = await this.db.query(
      'SELECT 1 FROM inscripcion_jugadores WHERE torneo_id = $1 AND jugador_id = $2 LIMIT 1',
      [torneoId, jugadorId],
    );
    return res.rows.length > 0;
  }

  async obtenerPorTorneo(torneoId) {
    const res = await this.db.query(
      'SELECT * FROM inscripciones WHERE torneo_id = $1 ORDER BY orden_inscripcion ASC',
      [torneoId],
    );
    return this.#mapearFilas(res.rows);
  }

  async obtenerPorJugador(jugadorId) {
    const res = await this.db.query(
      `SELECT i.* FROM inscripciones i
       JOIN inscripcion_jugadores ij ON ij.inscripcion_id = i.id
       WHERE ij.jugador_id = $1
       ORDER BY i.creado_en ASC`,
      [jugadorId],
    );
    return this.#mapearFilas(res.rows);
  }

  async #mapearFilas(filas) {
    if (filas.length === 0) return [];
    const ids = filas.map((fila) => fila.id);
    const jugadores = await this.db.query(
      'SELECT inscripcion_id, jugador_id FROM inscripcion_jugadores WHERE inscripcion_id = ANY($1)',
      [ids],
    );
    const porInscripcion = new Map();
    for (const fila of jugadores.rows) {
      if (!porInscripcion.has(fila.inscripcion_id)) porInscripcion.set(fila.inscripcion_id, []);
      porInscripcion.get(fila.inscripcion_id).push(fila.jugador_id);
    }
    return filas.map((fila) => new Inscripcion({
      id: fila.id,
      torneoId: fila.torneo_id,
      equipoId: fila.equipo_id,
      checkinConfirmado: fila.checkin_confirmado,
      estado: fila.estado,
      ordenInscripcion: fila.orden_inscripcion,
      jugadoresIds: porInscripcion.get(fila.id) ?? [],
      creadoEn: fila.creado_en
    }));
  }
}