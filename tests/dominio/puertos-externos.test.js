import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InscribirEquipo } from '../../src/dominio/casos-de-uso/InscribirEquipo.js';
import { CerrarCheckinYArmarLlave } from '../../src/dominio/casos-de-uso/CerrarCheckinYArmarLlave.js';
import { ReportarResultado } from '../../src/dominio/casos-de-uso/ReportarResultado.js';
import { Torneo, ESTADOS_TORNEO } from '../../src/dominio/entidades/Torneo.js';
import { Equipo } from '../../src/dominio/entidades/Equipo.js';
import { Inscripcion } from '../../src/dominio/entidades/Inscripcion.js';
import { Partido, ESTADOS_PARTIDO, RESULTADOS_REPORTE } from '../../src/dominio/entidades/Partido.js';
import { UnidadDeTrabajoMemoria } from '../../src/infra/memoria/UnidadDeTrabajoMemoria.js';
import { RelojFijo } from '../../src/infra/memoria/RelojFijo.js';
import { RelojSistema } from '../../src/infra/memoria/RelojSistema.js';
import { ProveedorIdentidadMemoria } from '../../src/infra/memoria/ProveedorIdentidadMemoria.js';
import { AlmacenEvidenciasMemoria } from '../../src/infra/memoria/AlmacenEvidenciasMemoria.js';
import { NotificadorMemoria, TIPOS_NOTIFICACION } from '../../src/infra/memoria/NotificadorMemoria.js';
import {
  ReglaDeNegocioError,
  ReporteInvalidoError,
  ServicioExternoNoDisponibleError,
} from '../../src/dominio/errores/index.js';

describe('Puertos Externos y Política Fail-Closed', () => {
  it('ProveedorIdentidadMemoria aplica fail-closed si el servicio externo cae (no inscribe)', async () => {
    const uow = new UnidadDeTrabajoMemoria();
    const reloj = new RelojFijo('2026-12-01T12:00:00Z');
    const proveedorIdentidad = new ProveedorIdentidadMemoria({ disponible: false });

    await uow.torneos.guardar(new Torneo({
      id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 4, tamanoEquipo: 2,
      semillaSorteo: 'semilla-test',
      fechaCierreInscripcion: '2026-12-10T00:00:00Z',
      inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
    }));
    await uow.equipos.guardar(new Equipo({ id: 'e1', nombre: 'Equipo Uno', capitanId: 'u1' }));

    const casoDeUso = new InscribirEquipo({ unidadDeTrabajo: uow, reloj, proveedorIdentidad });

    await assert.rejects(
      () => casoDeUso.ejecutar({
        torneoId: 't1', equipoId: 'e1', jugadoresIds: ['j1', 'j2'], usuarioSolicitanteId: 'u1',
      }),
      ServicioExternoNoDisponibleError,
    );

    const torneo = await uow.torneos.obtenerPorId('t1');
    assert.equal(torneo.inscriptosActuales, 0);
  });

  it('ProveedorIdentidadMemoria rechaza un jugador sin identidad válida en el juego', async () => {
    const uow = new UnidadDeTrabajoMemoria();
    const reloj = new RelojFijo('2026-12-01T12:00:00Z');
    const proveedorIdentidad = new ProveedorIdentidadMemoria({ jugadoresInvalidos: ['j-baneado'] });

    await uow.torneos.guardar(new Torneo({
      id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 4, tamanoEquipo: 2,
      semillaSorteo: 'semilla-test',
      fechaCierreInscripcion: '2026-12-10T00:00:00Z',
      inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
    }));
    await uow.equipos.guardar(new Equipo({ id: 'e1', nombre: 'Equipo Uno', capitanId: 'u1' }));

    const casoDeUso = new InscribirEquipo({ unidadDeTrabajo: uow, reloj, proveedorIdentidad });

    await assert.rejects(
      () => casoDeUso.ejecutar({
        torneoId: 't1', equipoId: 'e1', jugadoresIds: ['j1', 'j-baneado'], usuarioSolicitanteId: 'u1',
      }),
      ReglaDeNegocioError,
    );
  });

  it('AlmacenEvidenciasMemoria registra capturas válidas y aplica fail-closed si cae', async () => {
    const uow = new UnidadDeTrabajoMemoria();
    const almacenEvidencias = new AlmacenEvidenciasMemoria();
    const notificador = new NotificadorMemoria();

    await uow.torneos.guardar(new Torneo({
      id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 4, inscriptosActuales: 2, tamanoEquipo: 1,
      semillaSorteo: 'semilla-test',
      fechaCierreInscripcion: '2026-12-10T00:00:00Z',
      inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
      estado: ESTADOS_TORNEO.EN_CURSO,
    }));
    await uow.equipos.guardar(new Equipo({ id: 'e1', nombre: 'Equipo Uno', capitanId: 'u1' }));
    await uow.equipos.guardar(new Equipo({ id: 'e2', nombre: 'Equipo Dos', capitanId: 'u2' }));
    await uow.partidos.guardar(new Partido({
      id: 'p1', torneoId: 't1', ronda: 1, posicionEnRonda: 1,
      equipoAId: 'e1', equipoBId: 'e2', estado: ESTADOS_PARTIDO.EN_JUEGO,
    }));

    const casoDeUso = new ReportarResultado({ unidadDeTrabajo: uow, almacenEvidencias, notificador });

    await assert.rejects(
      () => casoDeUso.ejecutar({
        partidoId: 'p1', equipoId: 'e1', resultado: RESULTADOS_REPORTE.GANA_A,
        evidenciaUrl: 'url-invalida', usuarioSolicitanteId: 'u1',
      }),
      ReporteInvalidoError,
    );

    await casoDeUso.ejecutar({
      partidoId: 'p1', equipoId: 'e1', resultado: RESULTADOS_REPORTE.GANA_A,
      evidenciaUrl: 'https://evidencias.django.local/captura1.png', usuarioSolicitanteId: 'u1',
    });

    await casoDeUso.ejecutar({
      partidoId: 'p1', equipoId: 'e2', resultado: RESULTADOS_REPORTE.GANA_B,
      evidenciaUrl: 'https://evidencias.django.local/captura2.png', usuarioSolicitanteId: 'u2',
    });

    assert.equal(almacenEvidencias.evidencias.size, 2);
    assert.equal(notificador.notificaciones.length, 1);
    assert.equal(notificador.notificaciones[0].tipo, TIPOS_NOTIFICACION.PARTIDO_EN_DISPUTA);

    almacenEvidencias.simularCaida(true);
    await assert.rejects(
      () => casoDeUso.ejecutar({
        partidoId: 'p1', equipoId: 'e1', resultado: RESULTADOS_REPORTE.GANA_A,
        evidenciaUrl: 'https://evidencias.django.local/captura3.png', usuarioSolicitanteId: 'u1',
      }),
      ServicioExternoNoDisponibleError,
    );
  });

  it('NotificadorMemoria registra notificaciones de próximo partido al cerrar check-in', async () => {
    const uow = new UnidadDeTrabajoMemoria();
    const reloj = new RelojFijo('2026-12-11T02:00:00Z');
    const notificador = new NotificadorMemoria();

    await uow.torneos.guardar(new Torneo({
      id: 't1', nombre: 'Copa', juego: 'LoL', cupoMaximo: 4, inscriptosActuales: 4, tamanoEquipo: 1,
      semillaSorteo: 'semilla-test',
      fechaCierreInscripcion: '2026-12-10T00:00:00Z',
      inicioCheckin: '2026-12-11T00:00:00Z', finCheckin: '2026-12-11T01:00:00Z',
    }));

    for (let i = 1; i <= 4; i++) {
      await uow.inscripciones.guardar(new Inscripcion({
        id: `i${i}`, torneoId: 't1', equipoId: `e${i}`, ordenInscripcion: i,
        jugadoresIds: [`j${i}`], checkinConfirmado: true,
      }));
    }

    const casoDeUso = new CerrarCheckinYArmarLlave({ unidadDeTrabajo: uow, reloj, notificador });
    await casoDeUso.ejecutar({ torneoId: 't1' });

    assert.equal(notificador.notificaciones.length, 2);
    assert.ok(notificador.notificaciones.every((n) => n.tipo === TIPOS_NOTIFICACION.PROXIMO_PARTIDO));
  });

  it('RelojSistema devuelve una instancia Date válida', () => {
    const reloj = new RelojSistema();
    assert.ok(reloj.ahora() instanceof Date);
  });
});

