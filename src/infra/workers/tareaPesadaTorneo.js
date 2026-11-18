import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Torneo } from '../../dominio/entidades/Torneo.js';

function calcularFactorEsperado(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export function recalcularRankingEloMasivo({
  cantidadJugadores = 5000,
  rondasHistoricas = 120,
  semilla = 'semilla-elo-2026'
} = {}) {
  const jugadores = Array.from({ length: cantidadJugadores }, (_, indice) => ({
    jugadorId: `jugador-${indice + 1}`,
    puntosElo: 1000 + ((indice * 17) % 600),
    partidasJugadas: 0,
    victorias: 0
  }));

  const factorK = 32;

  for (let ronda = 0; ronda < rondasHistoricas; ronda++) {
    const hashRonda = createHash('sha256')
      .update(`${semilla}:ronda:${ronda}`)
      .digest();

    for (let i = 0; i < cantidadJugadores - 1; i += 2) {
      const idxA = (i + hashRonda[i % hashRonda.length]) % cantidadJugadores;
      const idxB = (idxA + 1 + (ronda % 7)) % cantidadJugadores;

      if (idxA === idxB) continue;

      const jugadorA = jugadores[idxA];
      const jugadorB = jugadores[idxB];

      const esperadoA = calcularFactorEsperado(jugadorA.puntosElo, jugadorB.puntosElo);
      const esperadoB = 1 - esperadoA;

      const byteDecision = createHash('sha256')
        .update(`${semilla}:${ronda}:${jugadorA.jugadorId}:${jugadorB.jugadorId}`)
        .digest()[0];

      const ganaA = byteDecision / 255 <= esperadoA;
      const resultadoA = ganaA ? 1 : 0;
      const resultadoB = ganaA ? 0 : 1;

      jugadorA.puntosElo = Math.max(
        100,
        Math.round(jugadorA.puntosElo + factorK * (resultadoA - esperadoA))
      );
      jugadorB.puntosElo = Math.max(
        100,
        Math.round(jugadorB.puntosElo + factorK * (resultadoB - esperadoB))
      );

      jugadorA.partidasJugadas += 1;
      jugadorB.partidasJugadas += 1;
      if (ganaA) {
        jugadorA.victorias += 1;
      } else {
        jugadorB.victorias += 1;
      }
    }
  }

  jugadores.sort((a, b) => b.puntosElo - a.puntosElo);

  return {
    totalJugadoresRecalculados: jugadores.length,
    rondasHistoricasProcesadas: rondasHistoricas,
    top10: jugadores.slice(0, 10)
  };
}

export function ejecutarSimulacionMasiva({
  cantidadEquipos = 1024,
  cantidadJugadoresElo = 5000,
  rondasHistoricas = 120,
  semilla = 'torneo-masivo-1024'
} = {}) {
  const inicioNs = process.hrtime.bigint();

  const torneo = new Torneo({
    id: '00000000-0000-4000-8000-000000001024',
    nombre: `Torneo Masivo ${cantidadEquipos} Equipos`,
    juego: 'Valorant',
    cupoMaximo: cantidadEquipos,
    inscriptosActuales: cantidadEquipos,
    tamanoEquipo: 5,
    semillaSorteo: semilla,
    fechaCierreInscripcion: new Date('2026-01-01T10:00:00Z'),
    inicioCheckin: new Date('2026-01-01T11:00:00Z'),
    finCheckin: new Date('2026-01-01T12:00:00Z')
  });

  const confirmados = Array.from({ length: cantidadEquipos }, (_, indice) => ({
    equipoId: `equipo-${indice + 1}`,
    ordenInscripcion: indice + 1
  }));

  const partidos = torneo.generarLlaveEliminacionSimple(confirmados);
  const inicioCalendarioMs = Date.parse('2026-01-02T15:00:00Z');

  const calendario = partidos.map((partido) => ({
    id: partido.id,
    ronda: partido.ronda,
    posicionEnRonda: partido.posicionEnRonda,
    equipoAId: partido.equipoAId,
    equipoBId: partido.equipoBId,
    esBye: partido.esBye,
    estado: partido.estado,
    inicioProgramado: new Date(
      inicioCalendarioMs +
        (partido.ronda - 1) * 3600 * 1000 +
        (partido.posicionEnRonda % 16) * 15 * 60 * 1000
    ).toISOString()
  }));

  const resumenElo = recalcularRankingEloMasivo({
    cantidadJugadores: cantidadJugadoresElo,
    rondasHistoricas,
    semilla
  });

  const duracionMs = Number(process.hrtime.bigint() - inicioNs) / 1e6;

  return {
    cantidadEquipos,
    totalPartidosGenerados: calendario.length,
    totalRondas: Math.ceil(Math.log2(cantidadEquipos)),
    primerosPartidosCalendario: calendario.slice(0, 5),
    rankingElo: resumenElo,
    duracionCalculoMs: Number(duracionMs.toFixed(2))
  };
}

export function ejecutarSimulacionEnWorker(parametros = {}) {
  return new Promise((resolve, reject) => {
    const workerUrl = new URL('./workerLlaveElo.js', import.meta.url);
    const worker = new Worker(workerUrl, {
      workerData: parametros
    });

    worker.once('message', (mensaje) => {
      if (mensaje?.ok) {
        resolve(mensaje.resultado);
      } else {
        reject(new Error(mensaje?.error ?? 'Error en worker de torneo masivo'));
      }
    });

    worker.once('error', (error) => {
      reject(error);
    });

    worker.once('exit', (codigo) => {
      if (codigo !== 0) {
        reject(new Error(`El worker finalizo con codigo de salida ${codigo}`));
      }
    });
  });
}

