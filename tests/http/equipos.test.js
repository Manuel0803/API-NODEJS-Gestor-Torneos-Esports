import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { CrearEquipo } from '../../src/dominio/casos-de-uso/CrearEquipo.js';
import { ListarEquiposDeCapitan } from '../../src/dominio/casos-de-uso/ListarEquiposDeCapitan.js';
import { ConsultarAgendaJugador } from '../../src/dominio/casos-de-uso/ConsultarAgendaJugador.js';
import { crearControladorEquipos } from '../../src/infra/http/controladores/equipos.controlador.js';
import { crearRutasEquipos } from '../../src/infra/http/rutas/equipos.rutas.js';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { Inscripcion } from '../../src/dominio/entidades/Inscripcion.js';
import { Partido } from '../../src/dominio/entidades/Partido.js';
import { construirApp, middlewaresDePrueba, como } from './ayudas/construirApp.js';

describe('Endpoints de equipos', () => {
  let uow;
  let app;
  const capitanUno = randomUUID();
  const capitanDos = randomUUID();

  beforeEach(() => {
    uow = new UnidadDeTrabajoMemoria();
    const casosDeUso = {
      crearEquipo: new CrearEquipo({ unidadDeTrabajo: uow }),
      listarEquiposDeCapitan: new ListarEquiposDeCapitan({ unidadDeTrabajo: uow }),
      consultarAgendaJugador: new ConsultarAgendaJugador({ unidadDeTrabajo: uow }),
    };
    app = construirApp(crearRutasEquipos({
      controlador: crearControladorEquipos({ casosDeUso }),
      ...middlewaresDePrueba(),
    }));
  });

  it('POST /equipos crea el equipo con el capitan tomado del token', async () => {
    const res = await request(app).post('/equipos').set(como(capitanUno, 'CAPITAN')).send({ nombre: 'Los Halcones' });
    assert.equal(res.status, 201);
    assert.equal(res.body.nombre, 'Los Halcones');
    assert.equal(res.body.capitanId, capitanUno);
    assert.equal((await uow.equipos.obtenerPorId(res.body.id)).capitanId, capitanUno);
  });

  it('POST /equipos rechaza que el cliente envie capitanId o campos extra', async () => {
    const res = await request(app).post('/equipos').set(como(capitanUno, 'CAPITAN'))
      .send({ nombre: 'Los Halcones', capitanId: capitanDos });
    assert.equal(res.status, 400);
    assert.equal(res.headers['content-type'].includes('application/problem+json'), true);
  });

  it('POST /equipos valida el nombre', async () => {
    const res = await request(app).post('/equipos').set(como(capitanUno, 'CAPITAN')).send({ nombre: 'ab' });
    assert.equal(res.status, 400);
  });

  it('POST /equipos exige autenticacion y rol CAPITAN', async () => {
    assert.equal((await request(app).post('/equipos').send({ nombre: 'Los Halcones' })).status, 401);
    const res = await request(app).post('/equipos').set(como(randomUUID(), 'JUGADOR')).send({ nombre: 'Los Halcones' });
    assert.equal(res.status, 403);
  });

  it('POST /equipos rechaza un nombre repetido', async () => {
    await request(app).post('/equipos').set(como(capitanUno, 'CAPITAN')).send({ nombre: 'Los Halcones' });
    const res = await request(app).post('/equipos').set(como(capitanDos, 'CAPITAN')).send({ nombre: 'Los Halcones' });
    assert.ok(res.status >= 400 && res.status < 500);
    assert.equal((await uow.equipos.obtenerPorCapitan(capitanDos)).length, 0);
  });

  it('GET /equipos lista solo los equipos del capitan autenticado', async () => {
    await request(app).post('/equipos').set(como(capitanUno, 'CAPITAN')).send({ nombre: 'Los Halcones' });
    await request(app).post('/equipos').set(como(capitanDos, 'CAPITAN')).send({ nombre: 'Los Lobos' });
    const res = await request(app).get('/equipos').set(como(capitanUno, 'CAPITAN'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.equipos.map((e) => e.nombre), ['Los Halcones']);
    assert.equal('capitanId' in res.body.equipos[0], false);
  });

  it('GET /jugadores/me/agenda devuelve solo los partidos pendientes de los equipos del jugador', async () => {
    const jugador = randomUUID();
    const torneoId = randomUUID();
    const [miEquipo, rival, ajeno] = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of [miEquipo, rival, ajeno]) {
      await uow.equipos.guardar(new Equipo({ id, nombre: `Equipo ${id}`, capitanId: randomUUID() }));
    }
    await uow.inscripciones.guardar(new Inscripcion({
      id: randomUUID(), torneoId, equipoId: miEquipo, jugadoresIds: [jugador], ordenInscripcion: 1,
    }));
    const pendiente = new Partido({
      id: randomUUID(), torneoId, ronda: 1, posicionEnRonda: 0,
      equipoAId: miEquipo, equipoBId: rival, estado: 'EN_JUEGO',
    });
    const confirmado = new Partido({
      id: randomUUID(), torneoId, ronda: 2, posicionEnRonda: 0,
      equipoAId: miEquipo, equipoBId: rival, estado: 'CONFIRMADO', ganadorId: miEquipo,
    });
    const ajenoPartido = new Partido({
      id: randomUUID(), torneoId, ronda: 1, posicionEnRonda: 1,
      equipoAId: rival, equipoBId: ajeno, estado: 'EN_JUEGO',
    });
    await uow.partidos.guardarTodos([pendiente, confirmado, ajenoPartido]);

    const res = await request(app).get('/jugadores/me/agenda').set(como(jugador, 'JUGADOR'));
    assert.equal(res.status, 200);
    assert.equal(res.body.agenda.length, 1);
    assert.equal(res.body.agenda[0].partidoId, pendiente.id);
    assert.equal(res.body.agenda[0].rivalEquipoId, rival);
  });
});
