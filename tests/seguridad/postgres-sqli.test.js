import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import argon2 from 'argon2';
import { crearPool } from '../../src/infra/db/pool.js';
import { UnidadDeTrabajoPg } from '../../src/infra/db/UnidadDeTrabajoPg.js';
import { crearDependencias } from '../../src/composicion.js';
import { crearApp } from '../../src/infra/http/app.js';
import { firmarToken } from '../../src/infra/http/middlewares/autenticacion.js';

const hayBaseDeDatos = Boolean(process.env.DB_HOST);
const SECRETO = 'secreto-de-prueba-de-al-menos-32-caracteres';
const TABLAS = [
  'usuarios', 'torneos', 'equipos', 'inscripciones', 'inscripcion_jugadores',
  'partidos', 'auditoria_arbitral', 'claves_idempotencia',
];

const PAYLOADS_SQL = [
  "' OR '1'='1",
  "' OR 1=1 --",
  "'; DROP TABLE equipos; --",
  "x'); DELETE FROM usuarios; --",
  "' UNION SELECT id, email, password_hash, nombre_usuario, gamer_tag, rol, puntos_elo, creado_en FROM usuarios --",
  "\\'; SELECT pg_sleep(5); --",
  '" OR ""="',
  "1; UPDATE usuarios SET rol='ORGANIZADOR'; --",
];

describe('Inyeccion SQL contra Postgres', { skip: !hayBaseDeDatos && 'sin DB_HOST' }, () => {
  let pool;
  let app;
  let capitanId;
  let capitanEmail;
  let hashCapitan;
  const usuarioIds = [];
  const equipoIds = [];

  const existenTodasLasTablas = async () => {
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM unnest($1::text[]) AS t(nombre) WHERE to_regclass(t.nombre) IS NOT NULL',
      [TABLAS],
    );
    return rows[0].n === TABLAS.length;
  };
  const tokenCapitan = () => `Bearer ${firmarToken({ id: capitanId, email: capitanEmail, rol: 'CAPITAN' }, SECRETO)}`;

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

    capitanId = randomUUID();
    capitanEmail = `${capitanId}@test.local`;
    hashCapitan = await argon2.hash('ClaveReal12345');
    await pool.query(
      `INSERT INTO usuarios (id, email, password_hash, nombre_usuario, gamer_tag, rol)
       VALUES ($1, $2, $3, $4, 'tag', 'CAPITAN')`,
      [capitanId, capitanEmail, hashCapitan, `u-${capitanId}`],
    );
    usuarioIds.push(capitanId);

    const dependencias = crearDependencias({ unidadDeTrabajo: new UnidadDeTrabajoPg(pool) });
    app = crearApp({ jwtSecret: SECRETO, dependencias });
  });

  after(async () => {
    await pool.query('DELETE FROM claves_idempotencia WHERE usuario_id = ANY($1)', [usuarioIds]);
    await pool.query('DELETE FROM equipos WHERE capitan_id = ANY($1)', [usuarioIds]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
  });

  it('login con payloads SQL en email y password nunca autentica ni devuelve token', async () => {
    for (const payload of PAYLOADS_SQL.slice(0, 4)) {
      const enPassword = await request(app).post('/auth/login').send({ email: capitanEmail, password: payload });
      assert.ok([400, 401, 429].includes(enPassword.status), `password ${payload} -> ${enPassword.status}`);
      assert.equal(enPassword.body.token, undefined);
      assert.equal(enPassword.body.accessToken, undefined);

      const enEmail = await request(app).post('/auth/login').send({ email: `${payload}@x.com`, password: 'cualquiera1' });
      assert.ok([400, 401, 429].includes(enEmail.status), `email ${payload} -> ${enEmail.status}`);
      assert.equal(enEmail.body.token, undefined);
      assert.equal(enEmail.body.accessToken, undefined);
    }
  });

  it('registro con payloads SQL guarda el texto literal y no altera otras filas', async () => {
    const nombre = "x'); DROP TABLE usuarios; --";
    const email = `${randomUUID()}@test.local`;
    const res = await request(app).post('/auth/registro').send({
      email, password: 'ClaveSegura123', nombreUsuario: nombre, gamerTag: "' OR '1'='1", rol: 'JUGADOR',
    });
    assert.equal(res.status, 201);
    usuarioIds.push(res.body.id);

    const { rows } = await pool.query('SELECT nombre_usuario, gamer_tag, rol FROM usuarios WHERE id = $1', [res.body.id]);
    assert.equal(rows[0].nombre_usuario, nombre);
    assert.equal(rows[0].gamer_tag, "' OR '1'='1");
    assert.equal(rows[0].rol, 'JUGADOR');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM usuarios WHERE email = $1', [email])).rows[0].n, 1);
    assert.ok(await existenTodasLasTablas());
  });

  it('crear equipo con payloads SQL en el nombre los guarda como texto y las tablas siguen intactas', async () => {
    let creados = 0;
    for (const payload of PAYLOADS_SQL) {
      const nombre = `${payload}`.slice(0, 50).padEnd(3, 'x');
      const res = await request(app)
        .post('/equipos')
        .set('authorization', tokenCapitan())
        .set('Idempotency-Key', randomUUID())
        .send({ nombre });
      assert.equal(res.status, 201, `payload ${payload} -> ${res.status}`);
      equipoIds.push(res.body.id);
      creados += 1;
      const { rows } = await pool.query('SELECT nombre FROM equipos WHERE id = $1', [res.body.id]);
      assert.equal(rows[0].nombre, nombre);
    }
    const propios = await pool.query('SELECT count(*)::int AS n FROM equipos WHERE capitan_id = $1', [capitanId]);
    assert.equal(propios.rows[0].n, creados);
    assert.ok(await existenTodasLasTablas());
    const capitan = await pool.query('SELECT count(*)::int AS n FROM usuarios WHERE id = $1', [capitanId]);
    assert.equal(capitan.rows[0].n, 1);
  });

  it('los usuarios existentes conservan rol y hash tras todos los intentos', async () => {
    const { rows } = await pool.query('SELECT rol, password_hash FROM usuarios WHERE id = $1', [capitanId]);
    assert.equal(rows[0].rol, 'CAPITAN');
    assert.equal(rows[0].password_hash, hashCapitan);
  });

  it('parametros de ruta con payloads SQL se rechazan o no encuentran nada, sin error 500', async () => {
    const rutas = [
      "/torneos/1' OR '1'='1/llave-publica",
      "/torneos/'; DROP TABLE torneos; --/llave-publica",
      '/torneos/1%27%20OR%201%3D1--/llave-publica',
    ];
    for (const ruta of rutas) {
      const res = await request(app).get(ruta);
      assert.ok(res.status >= 400 && res.status < 500, `${ruta} -> ${res.status}`);
    }
    assert.ok(await existenTodasLasTablas());
  });

  it('Idempotency-Key con payload SQL se trata como dato', async () => {
    const clave = "k'; DROP TABLE claves_idempotencia; --";
    const res = await request(app)
      .post('/equipos')
      .set('authorization', tokenCapitan())
      .set('Idempotency-Key', clave)
      .send({ nombre: 'Equipo clave sql' });
    assert.ok([201, 400].includes(res.status), `-> ${res.status}`);
    if (res.status === 201) equipoIds.push(res.body.id);
    const { rows } = await pool.query("SELECT to_regclass('claves_idempotencia') AS t");
    assert.ok(rows[0].t);
  });

  it('un payload con pg_sleep no retrasa la respuesta', async () => {
    const inicio = Date.now();
    await request(app).post('/auth/login').send({ email: capitanEmail, password: "'; SELECT pg_sleep(4); --" });
    assert.ok(Date.now() - inicio < 3000);
  });
});