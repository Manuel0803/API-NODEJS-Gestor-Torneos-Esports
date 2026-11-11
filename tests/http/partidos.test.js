import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { RelojSistema } from '../../src/infra/memoria/RelojSistema.js';
import { ReportarResultado } from '../../src/dominio/casos-de-uso/ReportarResultado.js';
import { ResolverDisputa } from '../../src/dominio/casos-de-uso/ResolverDisputa.js';
import { AnularPartido } from '../../src/dominio/casos-de-uso/AnularPartido.js';
import { crearControladorPartidos } from '../../src/infra/http/controladores/partidos.controlador.js';
import { crearRutasPartidos } from '../../src/infra/http/rutas/partidos.rutas.js';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { Partido } from '../../src/dominio/entidades/Partido.js';
import { Torneo } from '../../src/dominio/entidades/Torneo.js';
import { construirApp, middlewaresDePrueba, como } from './ayudas/construirApp.js';

describe('Endpoints de partidos y arbitraje', () => {
  let uow;
  let app;
  let torneoId;
  let capitanA;
  let capitanB;
  let equipoA;
  let equipoB;
  const arbitro = randomUUID();

  async function crearPartido(sobrescribir = {}) {
    const final = new Partido({ id: randomUUID(), torneoId, ronda: 2, posicionEnRonda: 0 });
    const partido = new Partido({
      id: randomUUID(), torneoId, ronda: 1, posicionEnRonda: 0,
      equipoAId: equipoA, equipoBId: equipoB, estado: 'EN_JUEGO',
      siguientePartidoId: final.id, slotSiguiente: 'A',
      ...sobrescribir,
    });
    await uow.partidos.guardarTodos([partido, final]);
    return { partido, final };
  }

  beforeEach(async () => {
    uow = new UnidadDeTrabajoMemoria();
    torneoId = randomUUID();
    capitanA = randomUUID();
    capitanB = randomUUID();
    equipoA = randomUUID();
    equipoB = randomUUID();
    await uow.torneos.guardar(new Torneo({
      id: torneoId,
      nombre: 'Copa HTTP',
      juego: 'LoL',
      cupoMaximo: 4,
      tamanoEquipo: 1,
      semillaSorteo: 'semilla-http',
      fechaCierreInscripcion: '2030-01-01T00:00:00Z',
      inicioCheckin: '2030-01-02T00:00:00Z',
      finCheckin: '2030-01-02T01:00:00Z',
      estado: 'EN_CURSO',
    }));
    await uow.equipos.guardar(new Equipo({ id: equipoA, nombre: 'Equipo Alfa', capitanId: capitanA }));
    await uow.equipos.guardar(new Equipo({ id: equipoB, nombre: 'Equipo Beta', capitanId: capitanB }));

    const casosDeUso = {
      reportarResultado: new ReportarResultado({ unidadDeTrabajo: uow }),
      resolverDisputa: new ResolverDisputa({ unidadDeTrabajo: uow, reloj: new RelojSistema() }),
      anularPartido: new AnularPartido({ unidadDeTrabajo: uow, reloj: new RelojSistema() }),
    };
    app = construirApp(crearRutasPartidos({
      controlador: crearControladorPartidos({ casosDeUso }),
      ...middlewaresDePrueba(),
    }));
  });

  it('dos capitanes reportando lo mismo confirman el partido y hacen avanzar al ganador', async () => {
    const { partido, final } = await crearPartido();
    const primero = await request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanA, 'CAPITAN'))
      .send({ equipoId: equipoA, resultado: 'GANA_A' });
    assert.equal(primero.status, 200);
    assert.equal(primero.body.estado, 'EN_JUEGO');

    const segundo = await request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanB, 'CAPITAN'))
      .send({ equipoId: equipoB, resultado: 'GANA_A' });
    assert.equal(segundo.status, 200);
    assert.equal(segundo.body.estado, 'CONFIRMADO');
    assert.equal(segundo.body.ganadorId, equipoA);
    assert.equal((await uow.partidos.obtenerPorId(final.id)).equipoAId, equipoA);
  });

  it('reportes contradictorios dejan el partido en disputa', async () => {
    const { partido } = await crearPartido();
    await request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanA, 'CAPITAN'))
      .send({ equipoId: equipoA, resultado: 'GANA_A' });
    const res = await request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanB, 'CAPITAN'))
      .send({ equipoId: equipoB, resultado: 'GANA_B' });
    assert.equal(res.body.enDisputa, true);
    assert.equal((await uow.partidos.obtenerPorId(partido.id)).estado, 'EN_DISPUTA');
  });

  it('un capitan no puede reportar en nombre de otro equipo', async () => {
    const { partido } = await crearPartido();
    const res = await request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanA, 'CAPITAN'))
      .send({ equipoId: equipoB, resultado: 'GANA_B' });
    assert.ok(res.status >= 400 && res.status < 500);
    assert.equal((await uow.partidos.obtenerPorId(partido.id)).reporteEquipoB, null);
  });

  it('valida identificador, campos extra y resultado', async () => {
    const { partido } = await crearPartido();
    const invalidos = [
      request(app).post('/partidos/no-es-uuid/reportes').set(como(capitanA, 'CAPITAN')).send({ equipoId: equipoA, resultado: 'GANA_A' }),
      request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanA, 'CAPITAN')).send({ equipoId: equipoA, resultado: 'EMPATE' }),
      request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanA, 'CAPITAN')).send({ equipoId: equipoA, resultado: 'GANA_A', ganadorId: equipoA }),
      request(app).post(`/partidos/${partido.id}/reportes`).set(como(capitanA, 'CAPITAN')).send({ equipoId: equipoA, resultado: 'GANA_A', evidenciaUrl: 'no-es-url' }),
    ];
    for (const respuesta of await Promise.all(invalidos)) {
      assert.equal(respuesta.status, 400);
    }
  });

  it('separa permisos: el arbitro no reporta y el capitan no arbitra', async () => {
    const { partido } = await crearPartido({ estado: 'EN_DISPUTA', reporteEquipoA: 'GANA_A', reporteEquipoB: 'GANA_B' });
    const reporteDeArbitro = await request(app).post(`/partidos/${partido.id}/reportes`).set(como(arbitro, 'ARBITRO'))
      .send({ equipoId: equipoA, resultado: 'GANA_A' });
    const resolucionDeCapitan = await request(app).post(`/partidos/${partido.id}/resolver-disputa`).set(como(capitanA, 'CAPITAN'))
      .send({ ganadorId: equipoA, motivo: 'quiero ganar' });
    const anulacionDeCapitan = await request(app).post(`/partidos/${partido.id}/anular`).set(como(capitanA, 'CAPITAN'))
      .send({ resolucion: 'REJUGAR', motivo: 'quiero repetir' });
    assert.equal(reporteDeArbitro.status, 403);
    assert.equal(resolucionDeCapitan.status, 403);
    assert.equal(anulacionDeCapitan.status, 403);
    assert.equal((await uow.partidos.obtenerPorId(partido.id)).estado, 'EN_DISPUTA');
  });

  it('el arbitro resuelve una disputa, avanza al ganador y queda auditoria', async () => {
    const { partido, final } = await crearPartido({ estado: 'EN_DISPUTA', reporteEquipoA: 'GANA_A', reporteEquipoB: 'GANA_B' });
    const res = await request(app).post(`/partidos/${partido.id}/resolver-disputa`).set(como(arbitro, 'ARBITRO'))
      .send({ ganadorId: equipoB, motivo: 'la evidencia favorece a Beta' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ganadorId, equipoB);
    assert.equal((await uow.partidos.obtenerPorId(final.id)).equipoAId, equipoB);
    const auditoria = await uow.auditoria.obtenerPorPartido(partido.id);
    assert.equal(auditoria.length, 1);
    assert.equal(auditoria[0].arbitroId, arbitro);
  });

  it('el arbitro anula un partido confirmado con REJUGAR y revierte la llave', async () => {
    const { partido, final } = await crearPartido({
      estado: 'CONFIRMADO', reporteEquipoA: 'GANA_A', reporteEquipoB: 'GANA_A', ganadorId: equipoA,
    });
    const finalConEquipo = await uow.partidos.obtenerPorId(final.id);
    finalConEquipo.asignarEquipo('A', equipoA);
    await uow.partidos.guardar(finalConEquipo);

    const res = await request(app).post(`/partidos/${partido.id}/anular`).set(como(arbitro, 'ARBITRO'))
      .send({ resolucion: 'REJUGAR', motivo: 'fallo tecnico del servidor' });
    assert.equal(res.status, 200);
    assert.equal(res.body.cascadaRevertida, true);
    assert.equal((await uow.partidos.obtenerPorId(partido.id)).estado, 'EN_JUEGO');
    assert.equal((await uow.partidos.obtenerPorId(final.id)).equipoAId, null);
  });

  it('anular con VICTORIA_ADMINISTRATIVA exige un ganador del partido', async () => {
    const { partido } = await crearPartido({
      estado: 'CONFIRMADO', reporteEquipoA: 'GANA_A', reporteEquipoB: 'GANA_A', ganadorId: equipoA,
    });
    const res = await request(app).post(`/partidos/${partido.id}/anular`).set(como(arbitro, 'ARBITRO'))
      .send({ resolucion: 'VICTORIA_ADMINISTRATIVA', motivo: 'sancion al rival' });
    assert.ok(res.status >= 400 && res.status < 500);
    assert.equal((await uow.partidos.obtenerPorId(partido.id)).ganadorId, equipoA);
  });
});
