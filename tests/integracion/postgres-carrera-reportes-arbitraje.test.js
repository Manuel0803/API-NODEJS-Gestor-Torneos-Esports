import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearPool } from '../../src/infra/db/pool.js';
import { UnidadDeTrabajoPg } from '../../src/infra/db/UnidadDeTrabajoPg.js';
import { RepoTorneoPostgres } from '../../src/infra/db/RepoTorneoPostgres.js';
import { RepoPartidoPostgres } from '../../src/infra/db/RepoPartidoPostgres.js';
import { RepoAuditoriaPostgres } from '../../src/infra/db/RepoAuditoriaPostgres.js';
import { ReportarResultado } from '../../src/dominio/casos-de-uso/ReportarResultado.js';
import { ResolverDisputa } from '../../src/dominio/casos-de-uso/ResolverDisputa.js';
import { RelojSistema } from '../../src/infra/memoria/RelojSistema.js';
import { Torneo } from '../../src/dominio/entidades/Torneo.js';
import { Partido } from '../../src/dominio/entidades/Partido.js';
import { PartidoNoModificableError } from '../../src/dominio/errores/index.js';

const hayBaseDeDatos = Boolean(process.env.DB_HOST);
const RONDAS = 20;

describe('Carreras de reportes y arbitraje en Postgres', { skip: !hayBaseDeDatos && 'sin DB_HOST' }, () => {
  let pool;
  let torneoId;
  let arbitroId;
  let unidadDeTrabajo;
  let reportar;
  let resolver;
  let posicion = 0;
  const usuarioIds = [];
  const equipoIds = [];

  async function crearUsuario(rol) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO usuarios (id, email, password_hash, nombre_usuario, gamer_tag, rol)
       VALUES ($1, $2, 'hash', $3, 'tag', $4)`,
      [id, `${id}@test.local`, `u-${id}`, rol],
    );
    usuarioIds.push(id);
    return id;
  }

  async function crearEquipo() {
    const capitanId = await crearUsuario('CAPITAN');
    const equipoId = randomUUID();
    await pool.query('INSERT INTO equipos (id, nombre, capitan_id) VALUES ($1, $2, $3)', [
      equipoId, `equipo-${equipoId}`, capitanId,
    ]);
    equipoIds.push(equipoId);
    return { equipoId, capitanId };
  }

  async function crearSemifinal(sobrescribir = {}) {
    const a = await crearEquipo();
    const b = await crearEquipo();
    const lugar = posicion;
    posicion += 1;
    const final = new Partido({ id: randomUUID(), torneoId, ronda: 2, posicionEnRonda: lugar });
    const semifinal = new Partido({
      id: randomUUID(), torneoId, ronda: 1, posicionEnRonda: lugar,
      equipoAId: a.equipoId, equipoBId: b.equipoId, estado: 'EN_JUEGO',
      siguientePartidoId: final.id, slotSiguiente: 'A',
      ...sobrescribir,
    });
    await new RepoPartidoPostgres(pool).guardarTodos([semifinal, final]);
    return { a, b, semifinal, final };
  }

  async function auditoriasDe(partidoId) {
    return new RepoAuditoriaPostgres(pool).obtenerPorPartido(partidoId);
  }

  const partidoPorId = (id) => new RepoPartidoPostgres(pool).obtenerPorId(id);

  before(async () => {
    pool = crearPool({
      DB_HOST: process.env.DB_HOST,
      DB_PORT: Number(process.env.DB_PORT ?? 5432),
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME: process.env.DB_NAME,
    });
    const sql = await readFile(new URL('../../src/infra/db/esquema.sql', import.meta.url), 'utf8');
    await pool.query(sql);

    torneoId = randomUUID();
    await new RepoTorneoPostgres(pool).guardar(new Torneo({
      id: torneoId,
      nombre: 'Copa reportes',
      juego: 'LoL',
      cupoMaximo: 8,
      tamanoEquipo: 1,
      semillaSorteo: 'semilla-reportes',
      fechaCierreInscripcion: '2030-01-01T00:00:00Z',
      inicioCheckin: '2030-01-02T00:00:00Z',
      finCheckin: '2030-01-02T01:00:00Z',
      estado: 'EN_CURSO',
    }));
    arbitroId = await crearUsuario('ARBITRO');
    unidadDeTrabajo = new UnidadDeTrabajoPg(pool);
    reportar = new ReportarResultado({ unidadDeTrabajo });
    resolver = new ResolverDisputa({ unidadDeTrabajo, reloj: new RelojSistema() });
  });

  after(async () => {
    await pool.query('DELETE FROM auditoria_arbitral WHERE partido_id IN (SELECT id FROM partidos WHERE torneo_id = $1)', [torneoId]);
    await pool.query('DELETE FROM partidos WHERE torneo_id = $1', [torneoId]);
    await pool.query('DELETE FROM torneos WHERE id = $1', [torneoId]);
    await pool.query('DELETE FROM equipos WHERE id = ANY($1)', [equipoIds]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
  });

  it('dos capitanes reportando a la vez confirman el partido una sola vez y hacen avanzar al ganador', async () => {
    for (let i = 0; i < RONDAS; i += 1) {
      const { a, b, semifinal, final } = await crearSemifinal();
      const resultados = await Promise.all([
        reportar.ejecutar({ partidoId: semifinal.id, equipoId: a.equipoId, resultado: 'GANA_A', usuarioSolicitanteId: a.capitanId }),
        reportar.ejecutar({ partidoId: semifinal.id, equipoId: b.equipoId, resultado: 'GANA_A', usuarioSolicitanteId: b.capitanId }),
      ]);
      assert.equal(resultados.filter((r) => r.estado === 'CONFIRMADO').length, 1);

      const guardado = await partidoPorId(semifinal.id);
      assert.equal(guardado.estado, 'CONFIRMADO');
      assert.equal(guardado.ganadorId, a.equipoId);

      const siguiente = await partidoPorId(final.id);
      assert.equal(siguiente.equipoAId, a.equipoId);
      assert.equal(siguiente.equipoBId, null);
    }
  });

  it('un capitan que reporta mientras el arbitro resuelve la disputa no altera el resultado del arbitro', async () => {
    for (let i = 0; i < RONDAS; i += 1) {
      const { a, b, semifinal, final } = await crearSemifinal({
        estado: 'EN_DISPUTA', reporteEquipoA: 'GANA_A', reporteEquipoB: 'GANA_B',
      });
      const [reporte, resolucion] = await Promise.allSettled([
        reportar.ejecutar({ partidoId: semifinal.id, equipoId: a.equipoId, resultado: 'GANA_A', usuarioSolicitanteId: a.capitanId }),
        resolver.ejecutar({ partidoId: semifinal.id, arbitroId, ganadorId: b.equipoId, motivo: 'revision de evidencia' }),
      ]);
      assert.equal(reporte.status, 'rejected');
      assert.ok(reporte.reason instanceof PartidoNoModificableError);
      assert.equal(resolucion.status, 'fulfilled');

      const guardado = await partidoPorId(semifinal.id);
      assert.equal(guardado.estado, 'CONFIRMADO');
      assert.equal(guardado.ganadorId, b.equipoId);
      assert.equal((await partidoPorId(final.id)).equipoAId, b.equipoId);
      assert.equal((await auditoriasDe(semifinal.id)).length, 1);
    }
  });

  it('dos arbitros resolviendo la misma disputa: uno gana y el otro es rechazado sin dejar auditoria extra', async () => {
    for (let i = 0; i < RONDAS; i += 1) {
      const { a, b, semifinal, final } = await crearSemifinal({
        estado: 'EN_DISPUTA', reporteEquipoA: 'GANA_A', reporteEquipoB: 'GANA_B',
      });
      const resultados = await Promise.allSettled([
        resolver.ejecutar({ partidoId: semifinal.id, arbitroId, ganadorId: a.equipoId, motivo: 'arbitro uno' }),
        resolver.ejecutar({ partidoId: semifinal.id, arbitroId, ganadorId: b.equipoId, motivo: 'arbitro dos' }),
      ]);
      const aprobadas = resultados.filter((r) => r.status === 'fulfilled');
      const rechazadas = resultados.filter((r) => r.status === 'rejected');
      assert.equal(aprobadas.length, 1);
      assert.equal(rechazadas.length, 1);
      assert.ok(rechazadas[0].reason instanceof PartidoNoModificableError);

      const guardado = await partidoPorId(semifinal.id);
      assert.equal(guardado.estado, 'CONFIRMADO');
      assert.equal((await partidoPorId(final.id)).equipoAId, guardado.ganadorId);
      assert.equal((await auditoriasDe(semifinal.id)).length, 1);
    }
  });
});