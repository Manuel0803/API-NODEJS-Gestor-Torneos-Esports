import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearApp } from '../../src/infra/http/app.js';
import { ProveedorIdentidadHttp } from '../../src/infra/externos/ProveedorIdentidadHttp.js';
import { AlmacenEvidenciasHttp } from '../../src/infra/externos/AlmacenEvidenciasHttp.js';

describe('Integracion bidireccional Express <-> Django', () => {
  const secreto = 'secreto-servicio-test';
  const app = crearApp({
    corsOrigin: 'http://localhost:3000,http://localhost:5173',
    internalServiceSecret: secreto
  });

  it('rechaza POST /api/integracion/eventos sin X-Service-Token con 401', async () => {
    const res = await request(app)
      .post('/api/integracion/eventos')
      .send({ tipo: 'SANCION_ANTICHEAT', datos: { jugadorId: 'j-1' } });

    assert.equal(res.status, 401);
  });

  it('rechaza POST /api/integracion/eventos con X-Service-Token invalido con 401', async () => {
    const res = await request(app)
      .post('/api/integracion/eventos')
      .set('X-Service-Token', 'token-incorrecto')
      .send({ tipo: 'SANCION_ANTICHEAT', datos: { jugadorId: 'j-1' } });

    assert.equal(res.status, 401);
  });

  it('acepta POST /api/integracion/eventos con X-Service-Token valido y payload correcto', async () => {
    const res = await request(app)
      .post('/api/integracion/eventos')
      .set('X-Service-Token', secreto)
      .send({ tipo: 'EVIDENCIA_REVISADA', datos: { evidenciaId: 'e-1', estado: 'APROBADA' } });

    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { recibido: true, tipo: 'EVIDENCIA_REVISADA' });
  });

  it('permite CORS desde http://localhost:5173 para el frontend', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  it('envia X-Service-Token desde ProveedorIdentidadHttp y AlmacenEvidenciasHttp', async () => {
    const llamadas = [];
    const fetchFn = async (url, opciones) => {
      llamadas.push({ url, opciones });
      const body = url.endsWith('/evidencias')
        ? { id: 'ev-1', url: 'http://localhost:8000/media/evidencias/ev-1.png' }
        : { invalidos: [] };
      return {
        status: url.endsWith('/evidencias') ? 201 : 200,
        json: async () => body
      };
    };

    const proveedor = new ProveedorIdentidadHttp({
      baseUrl: 'http://localhost:8000',
      timeoutMs: 500,
      serviceToken: secreto,
      fetchFn
    });
    const almacen = new AlmacenEvidenciasHttp({
      baseUrl: 'http://localhost:8000',
      timeoutMs: 500,
      serviceToken: secreto,
      fetchFn
    });

    await proveedor.verificarJugadores(['j-1']);
    await almacen.registrarEvidencia({
      partidoId: 'p-1',
      equipoId: 'eq-1',
      evidenciaUrl: 'https://img.test/cap.png'
    });

    assert.equal(llamadas[0].opciones.headers['x-service-token'], secreto);
    assert.equal(llamadas[1].opciones.headers['x-service-token'], secreto);
  });
});
