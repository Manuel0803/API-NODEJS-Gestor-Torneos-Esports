import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearPool } from '../../src/infra/db/pool.js';
import { UnidadDeTrabajoPg } from '../../src/infra/db/UnidadDeTrabajoPg.js';
import { RepoTorneoPostgres } from '../../src/infra/db/RepoTorneoPostgres.js';
import { RepoPartidoPostgres } from '../../src/infra/db/RepoPartidoPostgres.js';
import { Torneo } from '../../src/dominio/entidades/Torneo.js';
import { Partido } from '../../src/dominio/entidades/Partido.js';

const hayBaseDeDatos = Boolean(process.env.DB_HOST);

function nuevoTorneo(sobrescribir = {}) {
  return new Torneo({
    id: randomUUID(),
    nombre: 'Copa integracion',
    juego: 'LoL',
    cupoMaximo: 4,
    tamanoEquipo: 1,
    semillaSorteo: 'semilla-integracion',
    fechaCierreInscripcion: '2030-01-01T00:00:00Z',
    inicioCheckin: '2030-01-02T00:00:00Z',
    finCheckin: '2030-01-02T01:00:00Z',
    ...sobrescribir,
  });
}

describe('Persistencia en Postgres', { skip: !hayBaseDeDatos && 'sin DB_HOST' }, () => {
  let pool;
  let torneos;
  let partidos;
  let uow;
  const torneoIds = [];
  const usuarioIds = [];
  const equipoIds = [];

  async function crearEquipo() {
    const usuarioId = randomUUID();
    const equipoId = randomUUID();
    await pool.query(
      `INSERT INTO usuarios (id, email, password_hash, nombre_usuario, gamer_tag, rol)
       VALUES ($1, $2, 'hash', $3, 'tag', 'CAPITAN')`,
      [usuarioId, `${usuarioId}@test.local`, `u-${usuarioId}`],
    );
    await pool.query('INSERT INTO equipos (id, nombre, capitan_id) VALUES ($1, $2, $3)', [
      equipoId, `e-${equipoId}`, usuarioId,
    ]);
    usuarioIds.push(usuarioId);
    equipoIds.push(equipoId);
    return equipoId;
  }

  async function guardarTorneo(torneo) {
    torneoIds.push(torneo.id);
    await torneos.guardar(torneo);
    return torneo;
  }

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
    torneos = new RepoTorneoPostgres(pool);
    partidos = new RepoPartidoPostgres(pool);
    uow = new UnidadDeTrabajoPg(pool);
  });

  after(async () => {
    await pool.query('DELETE FROM auditoria_arbitral WHERE partido_id IN (SELECT id FROM partidos WHERE torneo_id = ANY($1))', [torneoIds]);
    await pool.query('DELETE FROM partidos WHERE torneo_id = ANY($1)', [torneoIds]);
    await pool.query('DELETE FROM torneos WHERE id = ANY($1)', [torneoIds]);
    await pool.query('DELETE FROM equipos WHERE id = ANY($1)', [equipoIds]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
  });

  it('guarda y recupera un torneo con todos sus campos', async () => {
    const torneo = await guardarTorneo(nuevoTorneo());
    const leido = await torneos.obtenerPorId(torneo.id);
    assert.equal(leido.nombre, 'Copa integracion');
    assert.equal(leido.cupoMaximo, 4);
    assert.equal(leido.semillaSorteo, 'semilla-integracion');
    assert.equal(leido.estado, 'ABIERTO');
    assert.equal(leido.finCheckin.toISOString(), '2030-01-02T01:00:00.000Z');
  });

  it('persiste el cambio de estado a CANCELADO', async () => {
    const torneo = await guardarTorneo(nuevoTorneo());
    const leido = await torneos.obtenerPorId(torneo.id);
    leido.estado = 'CANCELADO';
    await torneos.guardar(leido);
    assert.equal((await torneos.obtenerPorId(torneo.id)).estado, 'CANCELADO');
  });

  it('lista solo torneos ABIERTOS con check-in vencido', async () => {
    const vencido = await guardarTorneo(nuevoTorneo({ finCheckin: '2030-01-02T01:00:00Z' }));
    const vigente = await guardarTorneo(nuevoTorneo({ finCheckin: '2030-01-02T09:00:00Z' }));
    const cancelado = await guardarTorneo(nuevoTorneo({ finCheckin: '2030-01-02T01:00:00Z', estado: 'CANCELADO' }));
    const ids = (await uow.listarTorneosCheckinVencido(new Date('2030-01-02T02:00:00Z'))).map((t) => t.id);
    assert.ok(ids.includes(vencido.id));
    assert.ok(!ids.includes(vigente.id));
    assert.ok(!ids.includes(cancelado.id));
  });

  it('guarda una llave completa respetando las FK entre partidos', async () => {
    const torneo = await guardarTorneo(nuevoTorneo());
    const [a, b, c, d] = [await crearEquipo(), await crearEquipo(), await crearEquipo(), await crearEquipo()];
    const final = new Partido({ id: randomUUID(), torneoId: torneo.id, ronda: 2, posicionEnRonda: 0 });
    const semiUno = new Partido({
      id: randomUUID(), torneoId: torneo.id, ronda: 1, posicionEnRonda: 0,
      equipoAId: a, equipoBId: b, estado: 'EN_JUEGO',
      siguientePartidoId: final.id, slotSiguiente: 'A',
    });
    const semiDos = new Partido({
      id: randomUUID(), torneoId: torneo.id, ronda: 1, posicionEnRonda: 1,
      equipoAId: c, equipoBId: d, estado: 'EN_JUEGO',
      siguientePartidoId: final.id, slotSiguiente: 'B',
    });
    await partidos.guardarTodos([semiUno, semiDos, final]);
    const leida = await partidos.obtenerPorId(semiDos.id);
    assert.equal(leida.siguientePartidoId, final.id);
    assert.equal(leida.slotSiguiente, 'B');
    assert.equal(leida.equipoAId, c);
    assert.equal(leida.estado, 'EN_JUEGO');
  });

  it('actualiza un partido, incrementa la version y lo bloquea para escritura', async () => {
    const torneo = await guardarTorneo(nuevoTorneo());
    const [a, b] = [await crearEquipo(), await crearEquipo()];
    const partido = new Partido({
      id: randomUUID(), torneoId: torneo.id, ronda: 1, posicionEnRonda: 0,
      equipoAId: a, equipoBId: b, estado: 'EN_JUEGO',
    });
    await partidos.guardar(partido);
    const versionInicial = (await partidos.obtenerPorId(partido.id)).version;
    partido.reporteEquipoA = 'GANA_A';
    await partidos.guardar(partido);
    const actualizado = await partidos.obtenerPorIdConBloqueo(partido.id);
    assert.equal(actualizado.reporteEquipoA, 'GANA_A');
    assert.equal(actualizado.version, versionInicial + 1);
  });

  it('hace rollback completo si el trabajo falla', async () => {
    const torneo = nuevoTorneo();
    torneoIds.push(torneo.id);
    await assert.rejects(
      uow.ejecutar(async ({ torneos: repo }) => {
        await repo.guardar(torneo);
        throw new Error('falla simulada');
      }),
      /falla simulada/,
    );
    assert.equal(await torneos.obtenerPorId(torneo.id), null);
  });

  it('confirma la transaccion cuando el trabajo termina bien', async () => {
    const torneo = nuevoTorneo();
    torneoIds.push(torneo.id);
    await uow.ejecutar(({ torneos: repo }) => repo.guardar(torneo));
    assert.ok(await torneos.obtenerPorId(torneo.id));
  });
});