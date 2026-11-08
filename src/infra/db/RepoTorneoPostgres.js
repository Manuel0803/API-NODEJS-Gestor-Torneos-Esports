import { Torneo } from '../../dominio/entidades/Torneo.js';

export class RepoTorneoPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async obtenerPorId(id) {
    const res = await this.db.query('SELECT * FROM torneos WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }
  
  async obtenerPorIdConBloqueo(id) {
    const res = await this.db.query('SELECT * FROM torneos WHERE id = $1 FOR UPDATE', [id]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async guardar(torneo) {
    const query = `
      INSERT INTO torneos (
        id, nombre, juego, formato, cupo_maximo, inscriptos_actuales, 
        tamano_equipo, semilla_sorteo, fecha_cierre_inscripcion, 
        inicio_checkin, fin_checkin, estado
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (id) DO UPDATE SET
        inscriptos_actuales = EXCLUDED.inscriptos_actuales,
        estado = EXCLUDED.estado
    `;
    const params = [
      torneo.id, torneo.nombre, torneo.juego, torneo.formato,
      torneo.cupoMaximo, torneo.inscriptosActuales, torneo.tamanoEquipo,
      torneo.semillaSorteo, torneo.fechaCierreInscripcion,
      torneo.inicioCheckin, torneo.finCheckin, torneo.estado
    ];
    await this.db.query(query, params);
  }

  #mapearEntidad(fila) {
    return new Torneo({
      id: fila.id,
      nombre: fila.nombre,
      juego: fila.juego,
      formato: fila.formato,
      cupoMaximo: fila.cupo_maximo,
      inscriptosActuales: fila.inscriptos_actuales,
      tamanoEquipo: fila.tamano_equipo,
      semillaSorteo: fila.semilla_sorteo,
      fechaCierreInscripcion: fila.fecha_cierre_inscripcion,
      inicioCheckin: fila.inicio_checkin,
      finCheckin: fila.fin_checkin,
      estado: fila.estado
    });
  }
    async obtenerAbiertosConCheckinVencido(ahora) {
    const res = await this.db.query(
      "SELECT * FROM torneos WHERE estado = 'ABIERTO' AND fin_checkin < $1 ORDER BY fin_checkin ASC",
      [ahora],
    );
    return res.rows.map((fila) => this.#mapearEntidad(fila));
  }
}