import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { middlewareCorrelacion } from './middlewares/contextoCorrelacion.js';
import { crearMonitorEventLoop } from './middlewares/monitorEventLoop.js';
import {
  middlewareRutaNoEncontrada,
  manejadorErrores
} from './middlewares/manejadorErrores.js';
import {
  crearMiddlewareAutenticacion,
  exigirRoles
} from './middlewares/autenticacion.js';
import {
  validarEsquema,
  rechazarContaminacionPrototipo
} from './middlewares/validarEsquema.js';
import { crearMiddlewareIdempotencia } from './middlewares/idempotencia.js';
import { crearControladorAuth } from './controladores/auth.controlador.js';
import { crearRutasAuth } from './rutas/auth.rutas.js';
import { crearControladorTorneos } from './controladores/torneos.controlador.js';
import { crearRutasTorneos } from './rutas/torneos.rutas.js';
import { crearControladorEquipos } from './controladores/equipos.controlador.js';
import { crearRutasEquipos } from './rutas/equipos.rutas.js';
import { crearControladorPartidos } from './controladores/partidos.controlador.js';
import { crearRutasPartidos } from './rutas/partidos.rutas.js';
import { crearRutasIntegracion } from './rutas/integracion.rutas.js';

function normalizarOrigenesCors(corsOrigin) {
  if (Array.isArray(corsOrigin)) {
    return corsOrigin;
  }
  if (typeof corsOrigin === 'string' && corsOrigin.includes(',')) {
    return corsOrigin
      .split(',')
      .map((origen) => origen.trim())
      .filter(Boolean);
  }
  return corsOrigin;
}

export function crearApp({
  corsOrigin = 'http://localhost:3000,http://localhost:5173',
  jwtSecret = 'super_secret_jwt_key_esports_2026',
  internalServiceSecret = 'dev-internal-service-secret',
  dependencias = null,
  verificarDisponibilidad = async () => true,
  configurarRutas = null
} = {}) {
  const app = express();
  const monitorLoop = crearMonitorEventLoop();
  app.locals.monitorEventLoop = monitorLoop;

  app.use(middlewareCorrelacion);
  app.use(helmet());
  app.use(cors({ origin: normalizarOrigenesCors(corsOrigin) }));
  app.use(express.json({ limit: '100kb' }));
  app.use(rechazarContaminacionPrototipo);

  app.use('/api/integracion', crearRutasIntegracion({ internalServiceSecret }));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      eventLoopLagMs: monitorLoop.obtenerMetricas()
    });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const disponible = await verificarDisponibilidad();
      if (!disponible) {
        return res.status(503).json({ status: 'not_ready' });
      }
      return res.status(200).json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'not_ready' });
    }
  });

  if (dependencias) {
    const verificarToken = crearMiddlewareAutenticacion(jwtSecret);
    const middlewareIdempotencia = crearMiddlewareIdempotencia({
      unidadDeTrabajo: dependencias.unidadDeTrabajo
    });

    const controladorAuth = crearControladorAuth({
      unidadDeTrabajo: dependencias.unidadDeTrabajo,
      jwtSecret
    });

    const controladorTorneos = crearControladorTorneos({
      unidadDeTrabajo: dependencias.unidadDeTrabajo,
      casosDeUso: dependencias.casosDeUso
    });

    const controladorEquipos = crearControladorEquipos({
      casosDeUso: dependencias.casosDeUso
    });

    const controladorPartidos = crearControladorPartidos({
      casosDeUso: dependencias.casosDeUso
    });

    app.use('/auth', crearRutasAuth({ controladorAuth, verificarToken }));
    app.use(
      '/torneos',
      crearRutasTorneos({
        controladorTorneos,
        verificarToken,
        middlewareIdempotencia
      })
    );
    app.use(
      crearRutasEquipos({
        controlador: controladorEquipos,
        verificarToken,
        exigirRoles,
        validarEsquema,
        middlewareIdempotencia
      })
    );
    app.use(
      crearRutasPartidos({
        controlador: controladorPartidos,
        verificarToken,
        exigirRoles,
        validarEsquema,
        middlewareIdempotencia
      })
    );
  }

  if (typeof configurarRutas === 'function') {
    configurarRutas(app);
  }

  app.use(middlewareRutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
