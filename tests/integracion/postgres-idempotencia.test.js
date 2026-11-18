import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearPool } from '../../src/infra/db/pool.js';
import { UnidadDeTrabajoPg } from '../../src/infra/db/UnidadDeTrabajoPg.js';

const hayBaseDeDatos = Boolean(process.env.DB_HOST);

describe('Repositorio de idempotencia en Postgres', { skip: !hayBaseDeDatos && 'sin DB_HOST' }, () => {
  let pool;
  let repo;
  let usuarioId;

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
    usuarioId = randomUUID();
    await pool.query(
      `INSERT INTO usuarios (id, email, password_hash, nombre_usuario, gamer_tag, rol)
       VALUES ($1, $2, 'hash', $3, 'tag', 'CAPITAN')`,
      [usuarioId, `${usuarioId}@test.local`, `u-${usuarioId}`],
    );
    repo = new UnidadDeTrabajoPg(pool).clavesIdempotencia;
  });

  after(async () => {
    await pool.query('DELETE FROM claves_idempotencia WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
    await pool.end();
  });

  it('devuelve null si la clave no existe', async () => {
    assert.equal(await repo.obtener(usuarioId, randomUUID()), null);
  });

  it('guarda y recupera huella, codigo y cuerpo', async () => {
    const clave = randomUUID();
    await repo.guardar({
      usuarioId, clave, huellaPeticion: 'abc', codigoHttp: 201, cuerpoRespuesta: { id: 'x', n: 1 },
    });
    assert.deepEqual(await repo.obtener(usuarioId, clave), {
      huellaPeticion: 'abc', codigoHttp: 201, cuerpoRespuesta: { id: 'x', n: 1 },
    });
  });

  it('no sobrescribe una clave ya guardada', async () => {
    const clave = randomUUID();
    await repo.guardar({ usuarioId, clave, huellaPeticion: 'uno', codigoHttp: 201, cuerpoRespuesta: { v: 1 } });
    await repo.guardar({ usuarioId, clave, huellaPeticion: 'dos', codigoHttp: 500, cuerpoRespuesta: { v: 2 } });
    const guardada = await repo.obtener(usuarioId, clave);
    assert.equal(guardada.huellaPeticion, 'uno');
    assert.equal(guardada.codigoHttp, 201);
  });

  it('veinte guardados simultaneos de la misma clave dejan una sola fila', async () => {
    const clave = randomUUID();
    await Promise.all(Array.from({ length: 20 }, (_, i) => repo.guardar({
      usuarioId, clave, huellaPeticion: `h${i}`, codigoHttp: 200, cuerpoRespuesta: { i },
    })));
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM claves_idempotencia WHERE usuario_id = $1 AND clave = $2',
      [usuarioId, clave],
    );
    assert.equal(rows[0].n, 1);
  });

  it('la misma clave en otro usuario es independiente', async () => {
    const clave = randomUUID();
    await repo.guardar({ usuarioId, clave, huellaPeticion: 'h', codigoHttp: 200, cuerpoRespuesta: {} });
    assert.equal(await repo.obtener(randomUUID(), clave), null);
  });

  it('un usuario anonimo no UUID no rompe ni guarda', async () => {
    assert.equal(await repo.obtener('anonimo', 'k'), null);
    await assert.doesNotReject(repo.guardar({
      usuarioId: 'anonimo', clave: 'k', huellaPeticion: 'h', codigoHttp: 200, cuerpoRespuesta: {},
    }));
  });
});
