import { fileURLToPath } from 'node:url';
import { cargarEnv } from './config/env.js';
import { crearDependencias } from './composicion.js';
import { crearApp } from './infra/http/app.js';
import { logger } from './infra/http/middlewares/contextoCorrelacion.js';

export async function procesarCheckinsVencidos({
  unidadDeTrabajo,
  cerrarCheckinYArmarLlave,
  reloj
}) {
  if (typeof unidadDeTrabajo.listarTorneosCheckinVencido !== 'function') {
    return;
  }

  const ahora = reloj.ahora();
  const torneosVencidos = await unidadDeTrabajo.listarTorneosCheckinVencido(ahora);

  for (const torneo of torneosVencidos) {
    await cerrarCheckinYArmarLlave.ejecutar({
      torneoId: torneo.id,
      esAutomatico: true
    });
  }
}

export function iniciarServidor({
  env = cargarEnv(),
  dependencias = crearDependencias({ env }),
  intervaloCheckinMs = 30000
} = {}) {
  const app = crearApp({
    corsOrigin: env.CORS_ORIGIN,
    jwtSecret: env.JWT_SECRET,
    dependencias,
    verificarDisponibilidad: dependencias.verificarDisponibilidad
  });

  const servidorHttp = app.listen(env.PORT, () => {
    logger.info('Servidor HTTP iniciado', {
      puerto: env.PORT,
      entorno: env.NODE_ENV
    });
  });

  const timerCheckin = setInterval(() => {
    procesarCheckinsVencidos({
      unidadDeTrabajo: dependencias.unidadDeTrabajo,
      cerrarCheckinYArmarLlave: dependencias.casosDeUso.cerrarCheckinYArmarLlave,
      reloj: dependencias.reloj
    }).catch((error) => {
      logger.error('Error en job periodico de cierre de check-in', {
        detalle: error.message
      });
    });
  }, intervaloCheckinMs);

  timerCheckin.unref();

  let cerrando = false;

  const cerrarServidor = (senal) => {
    if (cerrando) return;
    cerrando = true;

    logger.info(`Senal ${senal} recibida, iniciando cierre del servidor`);

    clearInterval(timerCheckin);

    const timerForzado = setTimeout(() => {
      logger.error('Tiempo de espera agotado al cerrar el servidor, forzando salida');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);

    timerForzado.unref();

    servidorHttp.close(async () => {
      try {
        await dependencias.cerrarRecursos();
        clearTimeout(timerForzado);
        process.exit(0);
      } catch (error) {
        logger.error('Error liberando recursos al cerrar el servidor', {
          detalle: error.message
        });
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => cerrarServidor('SIGTERM'));
  process.on('SIGINT', () => cerrarServidor('SIGINT'));

  return { app, servidorHttp, cerrarServidor };
}

const esEjecucionDirecta =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (esEjecucionDirecta) {
  iniciarServidor();
}
