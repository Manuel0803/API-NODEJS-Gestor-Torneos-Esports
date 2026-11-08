export class RepoAuditoriaPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async guardar(registro) {
    const query = `
      INSERT INTO auditoria_arbitral (partido_id, arbitro_id, accion, motivo, estado_anterior, fecha)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const params = [
      registro.partidoId, 
      registro.arbitroId, 
      registro.accion, 
      registro.motivo, 
      JSON.stringify(registro.estadoAnterior), 
      registro.fecha, 
    ];
    await this.db.query(query, params);
  }

  async obtenerPorPartido(partidoId) {
    const res = await this.db.query('SELECT * FROM auditoria_arbitral WHERE partido_id = $1 ORDER BY fecha ASC', [partidoId]);
    return res.rows.map(row => ({
      id: row.id,
      partidoId: row.partido_id,
      arbitroId: row.arbitro_id,
      accion: row.accion,
      motivo: row.motivo,
      estadoAnterior: row.estado_anterior,
      fecha: row.fecha
    }));
  }
}