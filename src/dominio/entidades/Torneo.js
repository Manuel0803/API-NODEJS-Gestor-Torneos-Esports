import { randomUUID } from 'node:crypto';
import {
  CupoAgotadoError,
  TorneoCerradoError,
  CheckinFueraDeVentanaError,
  ReglaDeNegocioError
} from '../errores/index.js';
import { ESTADOS_PARTIDO } from './Partido.js';

export const ESTADOS_TORNEO = Object.freeze({
  ABIERTO: 'ABIERTO',
  EN_CURSO: 'EN_CURSO',
  FINALIZADO: 'FINALIZADO'
});

export const FORMATOS_TORNEO = Object.freeze({
  ELIMINACION_SIMPLE: 'ELIMINACION_SIMPLE'
});

function crearPrng(semilla) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < semilla.length; i++) {
    h = Math.imul(h ^ semilla.charCodeAt(i), 16777619) >>> 0;
  }
  return function () {
    h = Math.imul(h ^ (h >>> 15), 1 | h) >>> 0;
    h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

function barajarConSemilla(elementos, semilla) {
  const copia = [...elementos];
  const rand = crearPrng(semilla);
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export class Torneo {
  constructor({
    id,
    nombre,
    juego,
    formato = FORMATOS_TORNEO.ELIMINACION_SIMPLE,
    cupoMaximo,
    inscriptosActuales = 0,
    tamanoEquipo = 1,
    semillaSorteo = 'seed-default',
    fechaCierreInscripcion,
    inicioCheckin,
    finCheckin,
    estado = ESTADOS_TORNEO.ABIERTO
  }) {
    if (!id || !nombre || !juego || !cupoMaximo) {
      throw new ReglaDeNegocioError('id, nombre, juego y cupoMaximo son obligatorios');
    }

    if (cupoMaximo < 2) {
      throw new ReglaDeNegocioError('El cupo máximo no puede ser menor a 2');
    }

    if (tamanoEquipo < 1) {
      throw new ReglaDeNegocioError('El tamaño del equipo debe ser al menos 1');
    }

    const fechaCierre = new Date(fechaCierreInscripcion);
    const fechaInicioCheckin = new Date(inicioCheckin);
    const fechaFinCheckin = new Date(finCheckin);

    if (isNaN(fechaCierre.getTime()) || isNaN(fechaInicioCheckin.getTime()) || isNaN(fechaFinCheckin.getTime())) {
      throw new ReglaDeNegocioError('Fechas de inscripción o check-in inválidas');
    }

    if (fechaInicioCheckin > fechaFinCheckin) {
      throw new ReglaDeNegocioError('La fecha de inicio de check-in debe ser anterior a la de fin');
    }

    this.id = id;
    this.nombre = nombre;
    this.juego = juego;
    this.formato = formato;
    this.cupoMaximo = Number(cupoMaximo);
    this.inscriptosActuales = Number(inscriptosActuales);
    this.tamanoEquipo = Number(tamanoEquipo);
    this.semillaSorteo = String(semillaSorteo);
    this.fechaCierreInscripcion = fechaCierre;
    this.inicioCheckin = fechaInicioCheckin;
    this.finCheckin = fechaFinCheckin;
    this.estado = estado;
  }

  validarInscripcionPermitida(fechaActual = new Date()) {
    if (this.estado !== ESTADOS_TORNEO.ABIERTO) {
      throw new TorneoCerradoError(`Estado actual: ${this.estado}`);
    }

    if (fechaActual > this.fechaCierreInscripcion) {
      throw new TorneoCerradoError('Periodo de inscripción finalizado');
    }

    if (this.inscriptosActuales >= this.cupoMaximo) {
      throw new CupoAgotadoError(this.id, this.cupoMaximo);
    }
  }

  registrarInscripcion(fechaActual = new Date()) {
    this.validarInscripcionPermitida(fechaActual);
    this.inscriptosActuales += 1;
    return this.inscriptosActuales;
  }

  estaEnVentanaCheckin(fechaActual = new Date()) {
    return fechaActual >= this.inicioCheckin && fechaActual <= this.finCheckin;
  }

  checkinHaVencido(fechaActual = new Date()) {
    return fechaActual > this.finCheckin;
  }

  validarCheckinPermitido(fechaActual = new Date()) {
    if (this.estado !== ESTADOS_TORNEO.ABIERTO) {
      throw new TorneoCerradoError(`Estado actual: ${this.estado}`);
    }

    if (fechaActual < this.inicioCheckin) {
      throw new CheckinFueraDeVentanaError('El check-in aún no ha comenzado', {
        inicioCheckin: this.inicioCheckin,
        fechaActual
      });
    }

    if (fechaActual > this.finCheckin) {
      throw new CheckinFueraDeVentanaError('El check-in ya finalizó', {
        finCheckin: this.finCheckin,
        fechaActual
      });
    }
  }

  iniciarTorneo({ fechaActual = new Date(), cantidadInscriptos = null } = {}) {
    if (this.estado !== ESTADOS_TORNEO.ABIERTO) {
      throw new TorneoCerradoError(`Solo se puede iniciar en estado ABIERTO`);
    }

    if (fechaActual < this.inicioCheckin) {
      throw new ReglaDeNegocioError('No se puede iniciar el torneo antes de la ventana de check-in');
    }

    if (cantidadInscriptos !== null && cantidadInscriptos < 2) {
      throw new ReglaDeNegocioError(`Se requieren al menos 2 equipos para iniciar el torneo. Hay ${cantidadInscriptos}`);
    }

    this.estado = ESTADOS_TORNEO.EN_CURSO;
  }

  finalizarTorneo({ partidoFinal = null } = {}) {
    if (this.estado !== ESTADOS_TORNEO.EN_CURSO) {
      throw new TorneoCerradoError(`Solo se puede finalizar en estado EN_CURSO`);
    }

    if (partidoFinal) {
      if (partidoFinal.estado !== ESTADOS_PARTIDO.CONFIRMADO || !partidoFinal.ganadorId) {
        throw new ReglaDeNegocioError('El partido final debe estar confirmado con un ganador');
      }
    }

    this.estado = ESTADOS_TORNEO.FINALIZADO;
  }

  generarEstructuraLlave(equiposConfirmados) {
    const N = equiposConfirmados.length;
    if (N < 2) {
      throw new ReglaDeNegocioError(`Se requieren al menos 2 equipos confirmados. Hay ${N}`);
    }

    const equiposOrdenados = [...equiposConfirmados].sort(
      (a, b) => a.ordenInscripcion - b.ordenInscripcion
    );

    let P = 2;
    while (P < N) {
      P *= 2;
    }

    const cantidadByes = P - N;
    const equiposConBye = equiposOrdenados.slice(0, cantidadByes);
    const equiposRestantes = equiposOrdenados.slice(cantidadByes);
    const equiposEmparejados = barajarConSemilla(equiposRestantes, this.semillaSorteo);

    const totalRondas = Math.log2(P);
    const rondasPartidos = {};

    for (let r = totalRondas; r >= 1; r--) {
      const cantidadPartidosRonda = Math.pow(2, totalRondas - r);
      rondasPartidos[r] = [];

      for (let pos = 1; pos <= cantidadPartidosRonda; pos++) {
        const partidoId = randomUUID();
        let siguientePartidoId = null;
        let slotSiguiente = null;

        if (r < totalRondas) {
          const posSiguiente = Math.ceil(pos / 2);
          const partidoSiguiente = rondasPartidos[r + 1].find(p => p.posicionEnRonda === posSiguiente);
          siguientePartidoId = partidoSiguiente.id;
          slotSiguiente = pos % 2 === 1 ? 'A' : 'B';
        }

        rondasPartidos[r].push({
          id: partidoId,
          torneoId: this.id,
          ronda: r,
          posicionEnRonda: pos,
          equipoAId: null,
          equipoBId: null,
          esBye: false,
          reporteEquipoA: null,
          reporteEquipoB: null,
          evidenciaAUrl: null,
          evidenciaBUrl: null,
          ganadorId: null,
          estado: ESTADOS_PARTIDO.PENDIENTE,
          siguientePartidoId,
          slotSiguiente,
          version: 1
        });
      }
    }

    const partidosRonda1 = rondasPartidos[1];

    for (let b = 0; b < cantidadByes; b++) {
      const partido = partidosRonda1[b];
      const equipoConBye = equiposConBye[b];

      partido.equipoAId = equipoConBye.equipoId;
      partido.equipoBId = null;
      partido.esBye = true;
      partido.estado = ESTADOS_PARTIDO.CONFIRMADO;
      partido.ganadorId = equipoConBye.equipoId;

      if (partido.siguientePartidoId) {
        const partidoSiguiente = rondasPartidos[2].find(p => p.id === partido.siguientePartidoId);
        if (partidoSiguiente) {
          if (partido.slotSiguiente === 'A') {
            partidoSiguiente.equipoAId = equipoConBye.equipoId;
          } else {
            partidoSiguiente.equipoBId = equipoConBye.equipoId;
          }

          if (partidoSiguiente.equipoAId && partidoSiguiente.equipoBId) {
            partidoSiguiente.estado = ESTADOS_PARTIDO.EN_JUEGO;
          }
        }
      }
    }

    let indiceEmparejados = 0;
    for (let p = cantidadByes; p < partidosRonda1.length; p++) {
      const partido = partidosRonda1[p];

      if (indiceEmparejados < equiposEmparejados.length) {
        partido.equipoAId = equiposEmparejados[indiceEmparejados++].equipoId;
      }
      if (indiceEmparejados < equiposEmparejados.length) {
        partido.equipoBId = equiposEmparejados[indiceEmparejados++].equipoId;
      }

      if (partido.equipoAId && partido.equipoBId) {
        partido.estado = ESTADOS_PARTIDO.EN_JUEGO;
      }
    }

    const todosLosPartidos = [];
    for (let r = 1; r <= totalRondas; r++) {
      todosLosPartidos.push(...rondasPartidos[r]);
    }

    return todosLosPartidos;
  }
}
