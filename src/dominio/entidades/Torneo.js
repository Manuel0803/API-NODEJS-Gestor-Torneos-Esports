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

function hashFnv1a(texto) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash = Math.imul(hash ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash;
}

function crearMulberry32(semilla) {
  let estado = hashFnv1a(semilla);
  return function () {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajarConSemilla(elementos, semilla) {
  const copia = [...elementos];
  const aleatorio = crearMulberry32(semilla);
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function ordenDeSiembra(cantidadPosiciones) {
  let orden = [1];
  while (orden.length < cantidadPosiciones) {
    const suma = orden.length * 2 + 1;
    orden = orden.flatMap(siembra => [siembra, suma - siembra]);
  }
  return orden;
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
    semillaSorteo,
    fechaCierreInscripcion,
    inicioCheckin,
    finCheckin,
    estado = ESTADOS_TORNEO.ABIERTO
  }) {
    if (!id || !nombre || !juego || !cupoMaximo) {
      throw new ReglaDeNegocioError('id, nombre, juego y cupoMaximo son obligatorios');
    }

    if (typeof semillaSorteo !== 'string' || semillaSorteo.trim().length === 0) {
      throw new ReglaDeNegocioError('La semilla de sorteo es obligatoria');
    }

    if (!Object.values(FORMATOS_TORNEO).includes(formato)) {
      throw new ReglaDeNegocioError(`Formato de torneo no soportado: ${formato}`);
    }

    if (!Object.values(ESTADOS_TORNEO).includes(estado)) {
      throw new ReglaDeNegocioError(`Estado de torneo inválido: ${estado}`);
    }

    if (!Number.isInteger(Number(cupoMaximo)) || cupoMaximo < 2) {
      throw new ReglaDeNegocioError('El cupo máximo debe ser un entero mayor o igual a 2');
    }

    if (tamanoEquipo < 1) {
      throw new ReglaDeNegocioError('El tamaño del equipo debe ser al menos 1');
    }

    if (inscriptosActuales < 0 || inscriptosActuales > cupoMaximo) {
      throw new ReglaDeNegocioError('La cantidad de inscriptos debe estar entre 0 y el cupo máximo');
    }

    const fechaCierre = new Date(fechaCierreInscripcion);
    const fechaInicioCheckin = new Date(inicioCheckin);
    const fechaFinCheckin = new Date(finCheckin);

    if (isNaN(fechaCierre.getTime()) || isNaN(fechaInicioCheckin.getTime()) || isNaN(fechaFinCheckin.getTime())) {
      throw new ReglaDeNegocioError('Fechas de inscripción o check-in inválidas');
    }

    if (fechaCierre > fechaInicioCheckin) {
      throw new ReglaDeNegocioError('El cierre de inscripción debe ser anterior o igual al inicio del check-in');
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
    this.semillaSorteo = semillaSorteo.trim();
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

  iniciarTorneo({ fechaActual = new Date(), cantidadConfirmados } = {}) {
    if (this.estado !== ESTADOS_TORNEO.ABIERTO) {
      throw new TorneoCerradoError('Solo se puede iniciar en estado ABIERTO');
    }

    if (!this.checkinHaVencido(fechaActual)) {
      throw new ReglaDeNegocioError('No se puede iniciar el torneo hasta que cierre la ventana de check-in');
    }

    if (!Number.isInteger(cantidadConfirmados) || cantidadConfirmados < 2) {
      throw new ReglaDeNegocioError(
        `Se requieren al menos 2 equipos con check-in confirmado. Hay ${cantidadConfirmados ?? 0}`
      );
    }

    this.estado = ESTADOS_TORNEO.EN_CURSO;
  }

  finalizarTorneo({ partidoFinal } = {}) {
    if (this.estado !== ESTADOS_TORNEO.EN_CURSO) {
      throw new TorneoCerradoError('Solo se puede finalizar en estado EN_CURSO');
    }

    if (!partidoFinal || partidoFinal.siguientePartidoId) {
      throw new ReglaDeNegocioError('Se debe indicar el partido final de la llave');
    }

    if (partidoFinal.estado !== ESTADOS_PARTIDO.CONFIRMADO || !partidoFinal.ganadorId) {
      throw new ReglaDeNegocioError('El partido final debe estar confirmado con un ganador');
    }

    this.estado = ESTADOS_TORNEO.FINALIZADO;
  }

  generarEstructuraLlave(equiposConfirmados, { generarId = randomUUID } = {}) {
    const N = equiposConfirmados.length;
    if (N < 2) {
      throw new ReglaDeNegocioError(`Se requieren al menos 2 equipos confirmados. Hay ${N}`);
    }

    if (new Set(equiposConfirmados.map(e => e.equipoId)).size !== N) {
      throw new ReglaDeNegocioError('La lista de equipos confirmados contiene duplicados');
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
    const equiposEmparejados = barajarConSemilla(equiposOrdenados.slice(cantidadByes), this.semillaSorteo);

    const totalRondas = Math.log2(P);
    const rondasPartidos = {};

    for (let r = totalRondas; r >= 1; r--) {
      const cantidadPartidosRonda = Math.pow(2, totalRondas - r);
      rondasPartidos[r] = [];

      for (let pos = 1; pos <= cantidadPartidosRonda; pos++) {
        let siguientePartidoId = null;
        let slotSiguiente = null;

        if (r < totalRondas) {
          siguientePartidoId = rondasPartidos[r + 1][Math.ceil(pos / 2) - 1].id;
          slotSiguiente = pos % 2 === 1 ? 'A' : 'B';
        }

        rondasPartidos[r].push({
          id: generarId(),
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
    const siembraPorPosicion = ordenDeSiembra(partidosRonda1.length);
    let indiceEmparejados = 0;

    partidosRonda1.forEach((partido, indice) => {
      const siembra = siembraPorPosicion[indice];

      if (siembra <= cantidadByes) {
        const equipoId = equiposConBye[siembra - 1].equipoId;
        partido.equipoAId = equipoId;
        partido.esBye = true;
        partido.ganadorId = equipoId;
        partido.estado = ESTADOS_PARTIDO.CONFIRMADO;

        const partidoSiguiente = rondasPartidos[2][Math.ceil(partido.posicionEnRonda / 2) - 1];
        if (partido.slotSiguiente === 'A') {
          partidoSiguiente.equipoAId = equipoId;
        } else {
          partidoSiguiente.equipoBId = equipoId;
        }

        if (partidoSiguiente.equipoAId && partidoSiguiente.equipoBId) {
          partidoSiguiente.estado = ESTADOS_PARTIDO.EN_JUEGO;
        }
        return;
      }

      partido.equipoAId = equiposEmparejados[indiceEmparejados++].equipoId;
      partido.equipoBId = equiposEmparejados[indiceEmparejados++].equipoId;
      partido.estado = ESTADOS_PARTIDO.EN_JUEGO;
    });

    const todosLosPartidos = [];
    for (let r = 1; r <= totalRondas; r++) {
      todosLosPartidos.push(...rondasPartidos[r]);
    }

    return todosLosPartidos;
  }
}
