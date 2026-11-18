const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RepoIdempotenciaPostgres {
  constructor(clienteBd) {
    this.db = clienteBd;
  }

  async obtener(usuarioId, clave) {
    if (!UUID.test(String(usuarioId))) return null;
    const { rows } = await this.db.query(
      `SELECT huella_peticion, codigo_http, cuerpo_respuesta
         FROM claves_idempotencia
        WHERE usuario_id = $1 AND clave = $2`,
      [usuarioId, clave],
    );
    if (rows.length === 0) return null;
    return {
      huellaPeticion: rows[0].huella_peticion,
      codigoHttp: rows[0].codigo_http,
      cuerpoRespuesta: rows[0].cuerpo_respuesta,
    };
  }

  async guardar({ usuarioId, clave, huellaPeticion, codigoHttp, cuerpoRespuesta }) {
    if (!UUID.test(String(usuarioId))) return;
    await this.db.query(
      `INSERT INTO claves_idempotencia (usuario_id, clave, huella_peticion, codigo_http, cuerpo_respuesta)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (usuario_id, clave) DO NOTHING`,
      [usuarioId, clave, huellaPeticion, codigoHttp, JSON.stringify(cuerpoRespuesta ?? null)],
    );
  }
}
