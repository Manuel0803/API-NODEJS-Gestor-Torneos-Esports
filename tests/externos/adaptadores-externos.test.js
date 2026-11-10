import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ProveedorIdentidadHttp } from '../../src/infra/externos/ProveedorIdentidadHttp.js';
import { AlmacenEvidenciasHttp } from '../../src/infra/externos/AlmacenEvidenciasHttp.js';
import { NotificadorEstructurado } from '../../src/infra/externos/NotificadorEstructurado.js';
import {
  ReglaDeNegocioError,
  ReporteInvalidoError,
  ServicioExternoNoDisponibleError,
} from '../../src/dominio/errores/index.js';

function respuesta(status, cuerpo) {
  return { status, json: async () => cuerpo };
}

function fetchFalso(manejador) {
  const llamadas = [];
  const fn = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return manejador(url, opciones);
  };
  fn.llamadas = llamadas;
  return fn;
}

describe('ProveedorIdentidadHttp', () => {
  const crear = (fetchFn) => new ProveedorIdentidadHttp({ baseUrl: 'http://django.local/api/', timeoutMs: 200, fetchFn });

  it('acepta jugadores validos y envia los ids por POST', async () => {
    const fetchFn = fetchFalso(() => respuesta(200, { invalidos: [] }));
    assert.equal(await crear(fetchFn).verificarJugadores(['j1', 'j2']), true);
    assert.equal(fetchFn.llamadas[0].url, 'http://django.local/api/identidad/verificar');
    assert.equal(fetchFn.llamadas[0].opciones.method, 'POST');
    assert.deepEqual(JSON.parse(fetchFn.llamadas[0].opciones.body), { jugadoresIds: ['j1', 'j2'] });
  });

  it('rechaza con ReglaDeNegocioError si Django marca jugadores invalidos', async () => {
    const fetchFn = fetchFalso(() => respuesta(200, { invalidos: ['j2'] }));
    await assert.rejects(crear(fetchFn).verificarJugadores(['j1', 'j2']), ReglaDeNegocioError);
  });

  it('falla cerrado si Django responde 500', async () => {
    const fetchFn = fetchFalso(() => respuesta(500, {}));
    await assert.rejects(crear(fetchFn).verificarJugadores(['j1']), ServicioExternoNoDisponibleError);
  });

  it('falla cerrado si la conexion se rechaza', async () => {
    const fetchFn = fetchFalso(() => { throw new TypeError('fetch failed'); });
    await assert.rejects(crear(fetchFn).verificarJugadores(['j1']), ServicioExternoNoDisponibleError);
  });

  it('falla cerrado ante una respuesta con formato inesperado', async () => {
    const fetchFn = fetchFalso(() => respuesta(200, { ok: true }));
    await assert.rejects(crear(fetchFn).verificarJugadores(['j1']), ServicioExternoNoDisponibleError);
  });
});

describe('AlmacenEvidenciasHttp', () => {
  const crear = (fetchFn) => new AlmacenEvidenciasHttp({ baseUrl: 'http://django.local/api', timeoutMs: 200, fetchFn });
  const datos = { partidoId: 'p1', equipoId: 'e1', evidenciaUrl: 'https://img.test/captura.png' };

  it('registra la evidencia y devuelve la URL que entrega Django', async () => {
    const fetchFn = fetchFalso(() => respuesta(201, { url: 'https://cdn.test/e1.png' }));
    const registro = await crear(fetchFn).registrarEvidencia(datos);
    assert.equal(registro.url, 'https://cdn.test/e1.png');
    assert.equal(registro.partidoId, 'p1');
    assert.equal(fetchFn.llamadas[0].url, 'http://django.local/api/evidencias');
  });

  it('rechaza URLs que no son http(s) sin llamar a Django', async () => {
    const fetchFn = fetchFalso(() => respuesta(201, { url: 'x' }));
    await assert.rejects(crear(fetchFn).registrarEvidencia({ ...datos, evidenciaUrl: 'javascript:alert(1)' }), ReporteInvalidoError);
    await assert.rejects(crear(fetchFn).registrarEvidencia({ ...datos, evidenciaUrl: 'no-es-url' }), ReporteInvalidoError);
    assert.equal(fetchFn.llamadas.length, 0);
  });

  it('traduce un 422 de Django a ReporteInvalidoError', async () => {
    const fetchFn = fetchFalso(() => respuesta(422, {}));
    await assert.rejects(crear(fetchFn).registrarEvidencia(datos), ReporteInvalidoError);
  });

  it('falla cerrado si Django responde 503', async () => {
    const fetchFn = fetchFalso(() => respuesta(503, {}));
    await assert.rejects(crear(fetchFn).registrarEvidencia(datos), ServicioExternoNoDisponibleError);
  });
});

describe('Timeout real contra un servidor que no responde', () => {
  const servidor = createServer(() => {});
  let baseUrl;

  after(() => {
    servidor.closeAllConnections();
    servidor.close();
  });

  it('ambos adaptadores fallan cerrado al superar el timeout', async () => {
    await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    baseUrl = `http://127.0.0.1:${servidor.address().port}`;

    const inicio = Date.now();
    await assert.rejects(
      new ProveedorIdentidadHttp({ baseUrl, timeoutMs: 100 }).verificarJugadores(['j1']),
      ServicioExternoNoDisponibleError,
    );
    await assert.rejects(
      new AlmacenEvidenciasHttp({ baseUrl, timeoutMs: 100 }).registrarEvidencia({
        partidoId: 'p1', equipoId: 'e1', evidenciaUrl: 'https://img.test/a.png',
      }),
      ServicioExternoNoDisponibleError,
    );
    assert.ok(Date.now() - inicio < 2000);
  });
});

describe('NotificadorEstructurado', () => {
  it('emite una linea estructurada por cada tipo de notificacion', async () => {
    const eventos = [];
    const logger = { info: (mensaje, metadatos) => eventos.push({ mensaje, ...metadatos }) };
    const notificador = new NotificadorEstructurado({ logger });

    await notificador.notificarProximoPartido({ id: 'p1', torneoId: 't1', equipoAId: 'a', equipoBId: 'b' });
    await notificador.notificarCheckinPorVencer({ id: 't1', finCheckin: new Date('2030-01-01T00:00:00Z') });
    await notificador.notificarPartidoEnDisputa({ partidoId: 'p1', reportadoPorEquipoId: 'a' });

    assert.deepEqual(eventos.map((e) => e.tipo), ['PROXIMO_PARTIDO', 'CHECKIN_POR_VENCER', 'PARTIDO_EN_DISPUTA']);
    assert.equal(eventos[0].partidoId, 'p1');
    assert.equal(eventos[2].reportadoPorEquipoId, 'a');
  });
});
