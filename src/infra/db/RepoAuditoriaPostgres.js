import { randomUUID } from 'node:crypto';

export class RepoAuditoriaPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async guardar(registro) {
    const id = registro.id ?? randomUUID();
    await this.db.query(
      `INSERT INTO auditoria_arbitral (id, partido_id, arbitro_id, accion, motivo, estado_anterior, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id, registro.partidoId, registro.arbitroId, registro.accion,
        registro.motivo, JSON.stringify(registro.estadoAnterior), registro.fecha
      ],
    );
  }

  async obtenerPorPartido(partidoId) {
    const res = await this.db.query(
      'SELECT * FROM auditoria_arbitral WHERE partido_id = $1 ORDER BY fecha ASC',
      [partidoId],
    );
    return res.rows.map((fila) => ({
      id: fila.id,
      partidoId: fila.partido_id,
      arbitroId: fila.arbitro_id,
      accion: fila.accion,
      motivo: fila.motivo,
      estadoAnterior: fila.estado_anterior,
      fecha: fila.fecha
    }));
  }
}