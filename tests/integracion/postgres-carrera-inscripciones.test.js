import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearPool } from '../../src/infra/db/pool.js';
import { UnidadDeTrabajoPg } from '../../src/infra/db/UnidadDeTrabajoPg.js';
import { RepoTorneoPostgres } from '../../src/infra/db/RepoTorneoPostgres.js';
import { RepoInscripcionPostgres } from '../../src/infra/db/RepoInscripcionPostgres.js';
import { InscribirEquipo } from '../../src/dominio/casos-de-uso/InscribirEquipo.js';
import { RelojFijo } from '../../src/infra/memoria/RelojFijo.js';
import { Torneo } from '../../src/dominio/entidades/Torneo.js';
import { CupoAgotadoError } from '../../src/dominio/errores/index.js';

const hayBaseDeDatos = Boolean(process.env.DB_HOST);
const CUPO = 10;
const EQUIPOS = 50;

describe('Carrera de inscripciones en Postgres', { skip: !hayBaseDeDatos && 'sin DB_HOST' }, () => {
  let pool;
  let torneoId;
  const usuarioIds = [];
  const equipoIds = [];

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
  });

  after(async () => {
    await pool.query('DELETE FROM inscripcion_jugadores WHERE torneo_id = $1', [torneoId]);
    await pool.query('DELETE FROM inscripciones WHERE torneo_id = $1', [torneoId]);
    await pool.query('DELETE FROM torneos WHERE id = $1', [torneoId]);
    await pool.query('DELETE FROM equipos WHERE id = ANY($1)', [equipoIds]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
  });

  it(`${EQUIPOS} inscripciones simultaneas sobre ${CUPO} cupos: entran exactamente ${CUPO}`, async () => {
    torneoId = randomUUID();
    const torneo = new Torneo({
      id: torneoId,
      nombre: 'Copa carrera',
      juego: 'LoL',
      cupoMaximo: CUPO,
      tamanoEquipo: 1,
      semillaSorteo: 'semilla-carrera',
      fechaCierreInscripcion: '2030-01-01T00:00:00Z',
      inicioCheckin: '2030-01-02T00:00:00Z',
      finCheckin: '2030-01-02T01:00:00Z',
    });
    await new RepoTorneoPostgres(pool).guardar(torneo);

    const participantes = [];
    for (let i = 0; i < EQUIPOS; i += 1) {
      const usuarioId = randomUUID();
      const equipoId = randomUUID();
      await pool.query(
        `INSERT INTO usuarios (id, email, password_hash, nombre_usuario, gamer_tag, rol)
         VALUES ($1, $2, 'hash', $3, 'tag', 'CAPITAN')`,
        [usuarioId, `${usuarioId}@test.local`, `u-${usuarioId}`],
      );
      await pool.query('INSERT INTO equipos (id, nombre, capitan_id) VALUES ($1, $2, $3)', [
        equipoId, `equipo-${equipoId}`, usuarioId,
      ]);
      usuarioIds.push(usuarioId);
      equipoIds.push(equipoId);
      participantes.push({ usuarioId, equipoId });
    }

    const casoDeUso = new InscribirEquipo({
      unidadDeTrabajo: new UnidadDeTrabajoPg(pool),
      reloj: new RelojFijo('2029-12-01T00:00:00Z'),
    });

    const resultados = await Promise.allSettled(
      participantes.map(({ usuarioId, equipoId }) => casoDeUso.ejecutar({
        torneoId,
        equipoId,
        jugadoresIds: [usuarioId],
        usuarioSolicitanteId: usuarioId,
      })),
    );

    const exitosas = resultados.filter((r) => r.status === 'fulfilled');
    const rechazadas = resultados.filter((r) => r.status === 'rejected');
    assert.equal(exitosas.length, CUPO);
    assert.equal(rechazadas.length, EQUIPOS - CUPO);
    assert.ok(rechazadas.every((r) => r.reason instanceof CupoAgotadoError));

    const torneoFinal = await new RepoTorneoPostgres(pool).obtenerPorId(torneoId);
    assert.equal(torneoFinal.inscriptosActuales, CUPO);

    const guardadas = await new RepoInscripcionPostgres(pool).obtenerPorTorneo(torneoId);
    assert.equal(guardadas.length, CUPO);
    assert.deepEqual(
      guardadas.map((i) => i.ordenInscripcion),
      Array.from({ length: CUPO }, (_, i) => i + 1),
    );
    assert.ok(guardadas.every((i) => i.jugadoresIds.length === 1));
  });
});