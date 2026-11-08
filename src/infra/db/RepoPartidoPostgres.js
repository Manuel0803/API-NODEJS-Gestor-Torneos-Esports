import { Partido } from '../../dominio/entidades/Partido.js';

export class RepoPartidoPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async obtenerPorId(id) {
    const res = await this.db.query('SELECT * FROM partidos WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async obtenerPorIdConBloqueo(id) {
    const res = await this.db.query('SELECT * FROM partidos WHERE id = $1 FOR UPDATE', [id]);
    if (res.rows.length === 0) return null;
    return this.#mapearEntidad(res.rows[0]);
  }

  async guardar(partido) {
    const query = `
      INSERT INTO partidos (
        id, torneo_id, ronda, posicion_en_ronda, equipo_a_id, equipo_b_id, 
        es_bye, reporte_equipo_a, reporte_equipo_b, evidencia_a_url, evidencia_b_url, 
        ganador_id, estado, siguiente_partido_id, slot_siguiente, version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      ON CONFLICT (id) DO UPDATE SET
        equipo_a_id = EXCLUDED.equipo_a_id,
        equipo_b_id = EXCLUDED.equipo_b_id,
        reporte_equipo_a = EXCLUDED.reporte_equipo_a,
        reporte_equipo_b = EXCLUDED.reporte_equipo_b,
        evidencia_a_url = EXCLUDED.evidencia_a_url,
        evidencia_b_url = EXCLUDED.evidencia_b_url,
        ganador_id = EXCLUDED.ganador_id,
        estado = EXCLUDED.estado,
        version = partidos.version + 1
    `;
    const params = [
      partido.id, partido.torneoId, partido.ronda, partido.posicionEnRonda,
      partido.equipoAId, partido.equipoBId, partido.esBye,
      partido.reporteEquipoA, partido.reporteEquipoB,
      partido.evidenciaAUrl, partido.evidenciaBUrl, partido.ganadorId,
      partido.estado, partido.siguientePartidoId, partido.slotSiguiente, partido.version
    ];
    await this.db.query(query, params);
  }

  async guardarTodos(partidos) {
    const dePrimeraAUltima = [...partidos].sort((a, b) => b.ronda - a.ronda);
    for (const partido of dePrimeraAUltima) {  
      await this.guardar(partido);             
    }
  }

  #mapearEntidad(fila) {
    return new Partido({
      id: fila.id,
      torneoId: fila.torneo_id,
      ronda: fila.ronda,
      posicionEnRonda: fila.posicion_en_ronda,
      equipoAId: fila.equipo_a_id,
      equipoBId: fila.equipo_b_id,
      esBye: fila.es_bye,
      reporteEquipoA: fila.reporte_equipo_a,
      reporteEquipoB: fila.reporte_equipo_b,
      evidenciaAUrl: fila.evidencia_a_url,
      evidenciaBUrl: fila.evidencia_b_url,
      ganadorId: fila.ganador_id,
      estado: fila.estado,
      siguientePartidoId: fila.siguiente_partido_id,
      slotSiguiente: fila.slot_siguiente,
      version: fila.version
    });
  }
}