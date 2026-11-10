import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearPool } from '../../src/infra/db/pool.js';
import { UnidadDeTrabajoPg } from '../../src/infra/db/UnidadDeTrabajoPg.js';
import { RepoTorneoPostgres } from '../../src/infra/db/RepoTorneoPostgres.js';
import { RepoPartidoPostgres } from '../../src/infra/db/RepoPartidoPostgres.js';
import { RepoInscripcionPostgres } from '../../src/infra/db/RepoInscripcionPostgres.js';
import { CrearEquipo } from '../../src/dominio/casos-de-uso/CrearEquipo.js';
import { ListarEquiposDeCapitan } from '../../src/dominio/casos-de-uso/ListarEquiposDeCapitan.js';
import { ConsultarAgendaJugador } from '../../src/dominio/casos-de-uso/ConsultarAgendaJugador.js';
import { Torneo } from '../../src/dominio/entidades/Torneo.js';
import { Partido } from '../../src/dominio/entidades/Partido.js';
import { Inscripcion } from '../../src/dominio/entidades/Inscripcion.js';
import { ReglaDeNegocioError } from '../../src/dominio/errores/index.js';

const hayBaseDeDatos = Boolean(process.env.DB_HOST);

describe('Equipos y agenda en Postgres', { skip: !hayBaseDeDatos && 'sin DB_HOST' }, () => {
  let pool;
  let unidadDeTrabajo;
  const usuarioIds = [];
  const torneoIds = [];
  const equipoIds = [];

  async function crearUsuario(rol = 'CAPITAN') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO usuarios (id, email, password_hash, nombre_usuario, gamer_tag, rol)
       VALUES ($1, $2, 'hash', $3, 'tag', $4)`,
      [id, `${id}@test.local`, `u-${id}`, rol],
    );
    usuarioIds.push(id);
    return id;
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
    unidadDeTrabajo = new UnidadDeTrabajoPg(pool);
  });

  after(async () => {
    await pool.query('DELETE FROM partidos WHERE torneo_id = ANY($1)', [torneoIds]);
    await pool.query('DELETE FROM inscripcion_jugadores WHERE torneo_id = ANY($1)', [torneoIds]);
    await pool.query('DELETE FROM inscripciones WHERE torneo_id = ANY($1)', [torneoIds]);
    await pool.query('DELETE FROM torneos WHERE id = ANY($1)', [torneoIds]);
    await pool.query('DELETE FROM equipos WHERE capitan_id = ANY($1)', [usuarioIds]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
  });

  it('crea equipos, los lista por capitan y rechaza nombres repetidos', async () => {
    const crear = new CrearEquipo({ unidadDeTrabajo });
    const listar = new ListarEquiposDeCapitan({ unidadDeTrabajo });
    const capitan = await crearUsuario();
    const otroCapitan = await crearUsuario();
    const nombre = `Equipo ${randomUUID()}`;

    const equipo = await crear.ejecutar({ nombre, capitanId: capitan });
    equipoIds.push(equipo.id);
    await assert.rejects(crear.ejecutar({ nombre, capitanId: otroCapitan }), ReglaDeNegocioError);

    const delCapitan = await listar.ejecutar({ capitanId: capitan });
    assert.deepEqual(delCapitan.map((e) => e.id), [equipo.id]);
    assert.equal((await listar.ejecutar({ capitanId: otroCapitan })).length, 0);
  });

  it('dos capitanes creando el mismo nombre a la vez: uno entra y el otro recibe ReglaDeNegocioError', async () => {
    const crear = new CrearEquipo({ unidadDeTrabajo });
    const nombre = `Carrera ${randomUUID()}`;
    const capitanes = [await crearUsuario(), await crearUsuario()];

    const resultados = await Promise.allSettled(capitanes.map((capitanId) => crear.ejecutar({ nombre, capitanId })));
    const aprobadas = resultados.filter((r) => r.status === 'fulfilled');
    const rechazadas = resultados.filter((r) => r.status === 'rejected');
    assert.equal(aprobadas.length, 1);
    assert.equal(rechazadas.length, 1);
    assert.ok(rechazadas[0].reason instanceof ReglaDeNegocioError);
  });

  it('la agenda del jugador trae solo sus partidos pendientes', async () => {
    const torneoId = randomUUID();
    torneoIds.push(torneoId);
    await new RepoTorneoPostgres(pool).guardar(new Torneo({
      id: torneoId,
      nombre: 'Copa agenda',
      juego: 'LoL',
      cupoMaximo: 4,
      tamanoEquipo: 1,
      semillaSorteo: 'semilla-agenda',
      fechaCierreInscripcion: '2030-01-01T00:00:00Z',
      inicioCheckin: '2030-01-02T00:00:00Z',
      finCheckin: '2030-01-02T01:00:00Z',
      estado: 'EN_CURSO',
    }));

    const jugador = await crearUsuario('JUGADOR');
    const capitanRival = await crearUsuario();
    const crear = new CrearEquipo({ unidadDeTrabajo });
    const miEquipo = await crear.ejecutar({ nombre: `Mio ${randomUUID()}`, capitanId: jugador });
    const rival = await crear.ejecutar({ nombre: `Rival ${randomUUID()}`, capitanId: capitanRival });

    const inscripciones = new RepoInscripcionPostgres(pool);
    await inscripciones.guardar(new Inscripcion({
      id: randomUUID(), torneoId, equipoId: miEquipo.id, jugadoresIds: [jugador], ordenInscripcion: 1,
    }));
    await inscripciones.guardar(new Inscripcion({
      id: randomUUID(), torneoId, equipoId: rival.id, jugadoresIds: [capitanRival], ordenInscripcion: 2,
    }));

    const final = new Partido({ id: randomUUID(), torneoId, ronda: 2, posicionEnRonda: 0 });
    const semifinal = new Partido({
      id: randomUUID(), torneoId, ronda: 1, posicionEnRonda: 0,
      equipoAId: miEquipo.id, equipoBId: rival.id, estado: 'EN_JUEGO',
      siguientePartidoId: final.id, slotSiguiente: 'A',
    });
    await new RepoPartidoPostgres(pool).guardarTodos([semifinal, final]);

    const agenda = await new ConsultarAgendaJugador({ unidadDeTrabajo }).ejecutar({ jugadorId: jugador });
    assert.equal(agenda.length, 1);
    assert.equal(agenda[0].partidoId, semifinal.id);
    assert.equal(agenda[0].rivalEquipoId, rival.id);

    const agendaDelRival = await new ConsultarAgendaJugador({ unidadDeTrabajo }).ejecutar({ jugadorId: capitanRival });
    assert.equal(agendaDelRival[0].rivalEquipoId, miEquipo.id);
  });
});
