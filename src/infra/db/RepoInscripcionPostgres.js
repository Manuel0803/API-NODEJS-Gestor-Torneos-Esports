import { Inscripcion } from '../../dominio/entidades/Inscripcion.js';

export class RepoInscripcionPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async guardar(inscripcion) {
    const queryInscripcion = `
      INSERT INTO inscripciones (id, torneo_id, equipo_id, checkin_confirmado, estado, orden_inscripcion, creado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        checkin_confirmado = EXCLUDED.checkin_confirmado,
        estado = EXCLUDED.estado
    `;
    await this.db.query(queryInscripcion, [
      inscripcion.id, inscripcion.torneoId, inscripcion.equipoId, 
      inscripcion.checkinConfirmado, inscripcion.estado, 
      inscripcion.ordenInscripcion, inscripcion.creadoEn
    ]);

    
    await this.db.query('DELETE FROM inscripcion_jugadores WHERE inscripcion_id = $1', [inscripcion.id]);
    
    if (inscripcion.jugadoresIds.length > 0) {
      const values = inscripcion.jugadoresIds.map((_, i) => `($1, $2, $${i + 3})`).join(', ');
      const params = [inscripcion.id, inscripcion.torneoId, ...inscripcion.jugadoresIds];
      const queryJugadores = `INSERT INTO inscripcion_jugadores (inscripcion_id, torneo_id, jugador_id) VALUES ${values}`;
      await this.db.query(queryJugadores, params);
    }
  }

  async obtenerPorTorneoYEquipo(torneoId, equipoId) {
    const res = await this.db.query(
      'SELECT * FROM inscripciones WHERE torneo_id = $1 AND equipo_id = $2', 
      [torneoId, equipoId]
    );
    if (res.rows.length === 0) return null;
    return this.#armarEntidad(res.rows[0]);
  }

  async jugadorYaInscriptoEnTorneo(torneoId, jugadorId) {
    const res = await this.db.query(
      'SELECT 1 FROM inscripcion_jugadores WHERE torneo_id = $1 AND jugador_id = $2 LIMIT 1',
      [torneoId, jugadorId]
    );
    return res.rows.length > 0;
  }

  async obtenerPorTorneo(torneoId) {
    const res = await this.db.query('SELECT * FROM inscripciones WHERE torneo_id = $1 ORDER BY orden_inscripcion ASC', [torneoId]);
    return Promise.all(res.rows.map(fila => this.#armarEntidad(fila)));
  }

  async #armarEntidad(filaInscripcion) {
    const resJugadores = await this.db.query(
      'SELECT jugador_id FROM inscripcion_jugadores WHERE inscripcion_id = $1',
      [filaInscripcion.id]
    );
    
    return new Inscripcion({
      id: filaInscripcion.id,
      torneoId: filaInscripcion.torneo_id,
      equipoId: filaInscripcion.equipo_id,
      checkinConfirmado: filaInscripcion.checkin_confirmado,
      estado: filaInscripcion.estado,
      ordenInscripcion: filaInscripcion.orden_inscripcion,
      jugadoresIds: resJugadores.rows.map(r => r.jugador_id),
      creadoEn: filaInscripcion.creado_en
    });
  }
}