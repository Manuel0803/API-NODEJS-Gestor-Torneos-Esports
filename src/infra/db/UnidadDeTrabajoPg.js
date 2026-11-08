import { RepoTorneoPostgres } from './RepoTorneoPostgres.js';
import { RepoEquipoPostgres } from './RepoEquipoPostgres.js';
import { RepoInscripcionPostgres } from './RepoInscripcionPostgres.js';
import { RepoPartidoPostgres } from './RepoPartidoPostgres.js';
import { RepoAuditoriaPostgres } from './RepoAuditoriaPostgres.js';

export class UnidadDeTrabajoPg {
  constructor(pool) {
    this.pool = pool;
  }

  async ejecutar(trabajo) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await trabajo({
        torneos: new RepoTorneoPostgres(cliente),
        equipos: new RepoEquipoPostgres(cliente),
        inscripciones: new RepoInscripcionPostgres(cliente),
        partidos: new RepoPartidoPostgres(cliente),
        auditoria: new RepoAuditoriaPostgres(cliente),
      });
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async listarTorneosCheckinVencido(ahora) {
    return new RepoTorneoPostgres(this.pool).obtenerAbiertosConCheckinVencido(ahora);
  }
}