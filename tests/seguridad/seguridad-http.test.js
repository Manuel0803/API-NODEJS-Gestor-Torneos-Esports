import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { crearDependencias } from '../../src/composicion.js';
import { crearApp } from '../../src/infra/http/app.js';
import { firmarToken } from '../../src/infra/http/middlewares/autenticacion.js';
import { Usuario } from '../../src/dominio/entidades/Usuario.js';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { Torneo } from '../../src/dominio/entidades/Torneo.js';
import { Inscripcion } from '../../src/dominio/entidades/Inscripcion.js';
import { Partido } from '../../src/dominio/entidades/Partido.js';

const JWT_SECRET = 'super_secret_jwt_key_esports_2026_test';

function tokenBearer({ id = randomUUID(), email = 'test@torneos.test', rol }) {
  const token = firmarToken({ id, email, rol }, JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

describe('Bloque 8 — Seguridad HTTP, Idempotencia, Llave Publica y Worker 1024', () => {
  let dependencias;
  let app;
  let uow;
  let ahoraFijo;

  beforeEach(() => {
    ahoraFijo = new Date('2026-06-10T11:30:00Z');
    const relojFijo = { ahora: () => ahoraFijo };

    dependencias = crearDependencias({
      usarMemoria: true,
      reloj: relojFijo
    });
    uow = dependencias.unidadDeTrabajo;

    app = crearApp({
      jwtSecret: JWT_SECRET,
      dependencias
    });
  });

  it('IDOR: rechaza con 403 cuando un capitan intenta inscribir o hacer check-in en nombre de un equipo ajeno', async () => {
    const capitanDuenoId = randomUUID();
    const capitanIntrusoId = randomUUID();
    const jugadorId = randomUUID();
    const equipoId = randomUUID();
    const torneoId = randomUUID();

    await uow.usuarios.guardar(
      new Usuario({
        id: jugadorId,
        email: 'jugador1@torneos.test',
        passwordHash: 'hash_seguro',
        nombreUsuario: 'jugador1',
        gamerTag: 'PlayerOne',
        rol: 'JUGADOR'
      })
    );

    await uow.equipos.guardar(
      new Equipo({
        id: equipoId,
        nombre: 'Titanes del Norte',
        capitanId: capitanDuenoId
      })
    );

    await uow.torneos.guardar(
      new Torneo({
        id: torneoId,
        nombre: 'Copa Apertura',
        juego: 'Valorant',
        cupoMaximo: 8,
        tamanoEquipo: 1,
        semillaSorteo: 'semilla-idor',
        fechaCierreInscripcion: new Date('2026-06-10T10:00:00Z'),
        inicioCheckin: new Date('2026-06-10T11:00:00Z'),
        finCheckin: new Date('2026-06-10T12:00:00Z')
      })
    );

    await uow.inscripciones.guardar(
      new Inscripcion({
        id: randomUUID(),
        torneoId,
        equipoId,
        jugadoresIds: [jugadorId],
        ordenInscripcion: 1
      })
    );

    const resCheckinAjeno = await request(app)
      .post(`/torneos/${torneoId}/checkin`)
      .set(tokenBearer({ id: capitanIntrusoId, rol: 'CAPITAN' }))
      .send({ equipoId });

    assert.equal(resCheckinAjeno.status, 403);
    const inscripcion = await uow.inscripciones.obtenerPorTorneoYEquipo(torneoId, equipoId);
    assert.equal(inscripcion.checkinConfirmado, false);
  });

  it('Llave Publica: oculta emails, passwordHash, capitanId y URLs de evidencia para espectadores sin autenticar', async () => {
    const capitanAId = randomUUID();
    const capitanBId = randomUUID();
    const equipoAId = randomUUID();
    const equipoBId = randomUUID();
    const torneoId = randomUUID();
    const partidoId = randomUUID();

    await uow.usuarios.guardar(
      new Usuario({
        id: capitanAId,
        email: 'secreto.privado@correo.com',
        passwordHash: '$argon2id$v=19$hash_ultrasecreto',
        nombreUsuario: 'capitan_secreto',
        gamerTag: 'CapSecret',
        rol: 'CAPITAN'
      })
    );

    await uow.equipos.guardar(
      new Equipo({ id: equipoAId, nombre: 'Aguilas Rojas', capitanId: capitanAId })
    );
    await uow.equipos.guardar(
      new Equipo({ id: equipoBId, nombre: 'Lobos Azules', capitanId: capitanBId })
    );

    await uow.torneos.guardar(
      new Torneo({
        id: torneoId,
        nombre: 'Torneo Publico',
        juego: 'CS2',
        cupoMaximo: 4,
        inscriptosActuales: 2,
        tamanoEquipo: 1,
        semillaSorteo: 'semilla-privacidad',
        fechaCierreInscripcion: new Date('2026-06-09T10:00:00Z'),
        inicioCheckin: new Date('2026-06-09T11:00:00Z'),
        finCheckin: new Date('2026-06-09T12:00:00Z'),
        estado: 'EN_CURSO'
      })
    );

    await uow.inscripciones.guardar(
      new Inscripcion({
        id: randomUUID(),
        torneoId,
        equipoId: equipoAId,
        jugadoresIds: [capitanAId],
        checkinConfirmado: true,
        ordenInscripcion: 1
      })
    );

    await uow.partidos.guardar(
      new Partido({
        id: partidoId,
        torneoId,
        ronda: 1,
        posicionEnRonda: 0,
        equipoAId,
        equipoBId,
        estado: 'CONFIRMADO',
        ganadorId: equipoAId,
        reporteEquipoA: 'GANA_A',
        reporteEquipoB: 'GANA_A',
        evidenciaAUrl: 'https://evidencias.privadas/captura-secreta-a.png',
        evidenciaBUrl: 'https://evidencias.privadas/captura-secreta-b.png'
      })
    );

    const res = await request(app).get(`/torneos/${torneoId}/llave-publica`);

    assert.equal(res.status, 200);
    const textoRespuesta = JSON.stringify(res.body);
    assert.equal(textoRespuesta.includes('secreto.privado@correo.com'), false);
    assert.equal(textoRespuesta.includes('hash_ultrasecreto'), false);
    assert.equal(textoRespuesta.includes(capitanAId), false);
    assert.equal(textoRespuesta.includes('captura-secreta'), false);
    assert.equal(res.body.partidos[0].equipoANombre, 'Aguilas Rojas');
  });

  it('Anti Prototype Pollution: rechaza cargas con __proto__ y constructor.prototype sin contaminar Object.prototype', async () => {
    const organizadorHeader = tokenBearer({ rol: 'ORGANIZADOR' });

    const resProto = await request(app)
      .post('/torneos')
      .set(organizadorHeader)
      .set('Content-Type', 'application/json')
      .send(
        '{"nombre":"Torneo Hack","juego":"LoL","cupoMaximo":8,"tamanoEquipo":1,"semillaSorteo":"s1","fechaCierreInscripcion":"2026-07-01T10:00:00Z","inicioCheckin":"2026-07-01T11:00:00Z","finCheckin":"2026-07-01T12:00:00Z","__proto__":{"esAdminGlobal":true}}'
      );

    const resConstructor = await request(app)
      .post('/equipos')
      .set(tokenBearer({ rol: 'CAPITAN' }))
      .set('Content-Type', 'application/json')
      .send('{"nombre":"Equipo Hack","constructor":{"prototype":{"contaminado":true}}}');

    assert.equal(resProto.status, 400);
    assert.equal(resConstructor.status, 400);
    assert.equal({}.esAdminGlobal, undefined);
    assert.equal({}.contaminado, undefined);
  });

  it('Rate Limiting: devuelve 429 Too Many Requests con encabezado Retry-After al superar el limite en /auth/login', async () => {
    let ultimaRespuesta = null;

    for (let i = 0; i < 11; i++) {
      ultimaRespuesta = await request(app)
        .post('/auth/login')
        .send({ email: 'noexiste@torneos.test', password: 'Password123!' });
    }

    assert.equal(ultimaRespuesta.status, 429);
    assert.ok(ultimaRespuesta.headers['retry-after']);
    assert.equal(ultimaRespuesta.body.status, 429);
  });

  it('Idempotency-Key: ejecuta el efecto una sola vez ante reintentos identicos y rechaza con 422 si cambia el cuerpo', async () => {
    const capitanHeader = tokenBearer({ id: randomUUID(), rol: 'CAPITAN' });
    const claveIdempotencia = 'idem-equipo-001';

    const primera = await request(app)
      .post('/equipos')
      .set(capitanHeader)
      .set('Idempotency-Key', claveIdempotencia)
      .send({ nombre: 'Fenix Imperial' });

    assert.equal(primera.status, 201);
    assert.equal(primera.headers['idempotent-replayed'], undefined);

    const segunda = await request(app)
      .post('/equipos')
      .set(capitanHeader)
      .set('Idempotency-Key', claveIdempotencia)
      .send({ nombre: 'Fenix Imperial' });

    assert.equal(segunda.status, 201);
    assert.equal(segunda.headers['idempotent-replayed'], 'true');
    assert.equal(segunda.body.id, primera.body.id);

    const terceraConDistintoBody = await request(app)
      .post('/equipos')
      .set(capitanHeader)
      .set('Idempotency-Key', claveIdempotencia)
      .send({ nombre: 'Otro Nombre Distinto' });

    assert.equal(terceraConDistintoBody.status, 422);
  });

  it('Bloque 7 (Worker 1024 + Event Loop): genera llave de 1024 participantes y recalcula ELO en worker_thread reportando metricas en /health', async () => {
    const organizadorHeader = tokenBearer({ rol: 'ORGANIZADOR' });

    const resSimulacion = await request(app)
      .post('/torneos/simulacion-masiva')
      .set(organizadorHeader)
      .send({
        modo: 'worker',
        cantidadEquipos: 1024,
        cantidadJugadoresElo: 2000,
        rondasHistoricas: 40,
        semilla: 'test-1024'
      });

    assert.equal(resSimulacion.status, 200);
    assert.equal(resSimulacion.body.modoEjecucion, 'worker');
    assert.equal(resSimulacion.body.cantidadEquipos, 1024);
    assert.equal(resSimulacion.body.totalPartidosGenerados, 1023);
    assert.equal(resSimulacion.body.totalRondas, 10);
    assert.equal(resSimulacion.body.rankingElo.totalJugadoresRecalculados, 2000);

    const resHealth = await request(app).get('/health');
    assert.equal(resHealth.status, 200);
    assert.equal(resHealth.body.status, 'ok');
    assert.equal(typeof resHealth.body.eventLoopLagMs.p99Ms, 'number');
  });
});

