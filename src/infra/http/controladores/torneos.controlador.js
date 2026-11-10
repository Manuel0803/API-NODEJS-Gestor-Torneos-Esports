import { EntidadNoEncontradaError } from '../../../dominio/errores/index.js';

function serializarTorneo(torneo) {
  return {
    id: torneo.id,
    nombre: torneo.nombre,
    juego: torneo.juego,
    formato: torneo.formato,
    cupoMaximo: torneo.cupoMaximo,
    inscriptosActuales: torneo.inscriptosActuales,
    tamanoEquipo: torneo.tamanoEquipo,
    semillaSorteo: torneo.semillaSorteo,
    fechaCierreInscripcion: torneo.fechaCierreInscripcion,
    inicioCheckin: torneo.inicioCheckin,
    finCheckin: torneo.finCheckin,
    estado: torneo.estado
  };
}

function serializarInscripcion(inscripcion) {
  return {
    id: inscripcion.id,
    torneoId: inscripcion.torneoId,
    equipoId: inscripcion.equipoId,
    checkinConfirmado: inscripcion.checkinConfirmado,
    estado: inscripcion.estado,
    ordenInscripcion: inscripcion.ordenInscripcion,
    jugadorIds: inscripcion.jugadorIds,
    creadoEn: inscripcion.creadoEn
  };
}

function serializarPartidoPublico(partido, mapaNombresEquipos) {
  return {
    id: partido.id,
    ronda: partido.ronda,
    posicionEnRonda: partido.posicionEnRonda,
    equipoAId: partido.equipoAId,
    equipoANombre: partido.equipoAId ? (mapaNombresEquipos.get(partido.equipoAId) ?? null) : null,
    equipoBId: partido.equipoBId,
    equipoBNombre: partido.equipoBId ? (mapaNombresEquipos.get(partido.equipoBId) ?? null) : null,
    esBye: partido.esBye,
    ganadorId: partido.ganadorId,
    ganadorNombre: partido.ganadorId ? (mapaNombresEquipos.get(partido.ganadorId) ?? null) : null,
    estado: partido.estado,
    siguientePartidoId: partido.siguientePartidoId,
    slotSiguiente: partido.slotSiguiente
  };
}

export function crearControladorTorneos({ unidadDeTrabajo, casosDeUso }) {
  return {
    async crear(req, res, next) {
      try {
        const torneo = await casosDeUso.crearTorneo.ejecutar(req.body);
        return res.status(201).json(serializarTorneo(torneo));
      } catch (error) {
        return next(error);
      }
    },

    async listar(_req, res, next) {
      try {
        const torneos = await unidadDeTrabajo.torneos.listarTodos();
        return res.status(200).json(torneos.map(serializarTorneo));
      } catch (error) {
        return next(error);
      }
    },

    async inscribir(req, res, next) {
      try {
        const inscripcion = await casosDeUso.inscribirEquipo.ejecutar({
          torneoId: req.params.id,
          equipoId: req.body.equipoId,
          jugadorIds: req.body.jugadorIds,
          solicitanteId: req.usuario.id
        });

        return res.status(201).json(serializarInscripcion(inscripcion));
      } catch (error) {
        return next(error);
      }
    },

    async confirmarCheckin(req, res, next) {
      try {
        const inscripcion = await casosDeUso.confirmarCheckin.ejecutar({
          torneoId: req.params.id,
          equipoId: req.body.equipoId,
          solicitanteId: req.usuario.id
        });

        return res.status(200).json(serializarInscripcion(inscripcion));
      } catch (error) {
        return next(error);
      }
    },

    async armarLlave(req, res, next) {
      try {
        const resultado = await casosDeUso.cerrarCheckinYArmarLlave.ejecutar({
          torneoId: req.params.id
        });

        return res.status(200).json({
          torneo: serializarTorneo(resultado.torneo),
          totalPartidos: resultado.partidos.length,
          partidos: resultado.partidos.map((p) =>
            serializarPartidoPublico(p, new Map())
          )
        });
      } catch (error) {
        return next(error);
      }
    },

    async obtenerLlavePublica(req, res, next) {
      try {
        const torneoId = req.params.id;
        const torneo = await unidadDeTrabajo.torneos.obtenerPorId(torneoId);

        if (!torneo) {
          throw new EntidadNoEncontradaError('Torneo', torneoId);
        }

        const partidos = await unidadDeTrabajo.partidos.obtenerPorTorneo(torneoId);
        const inscripciones = await unidadDeTrabajo.inscripciones.obtenerPorTorneo(torneoId);

        const mapaNombresEquipos = new Map();
        const equiposPublicos = [];

        for (const inscripcion of inscripciones) {
          const equipo = await unidadDeTrabajo.equipos.obtenerPorId(inscripcion.equipoId);
          if (equipo) {
            mapaNombresEquipos.set(equipo.id, equipo.nombre);
            equiposPublicos.push({
              equipoId: equipo.id,
              nombre: equipo.nombre,
              estadoInscripcion: inscripcion.estado,
              checkinConfirmado: inscripcion.checkinConfirmado,
              ordenInscripcion: inscripcion.ordenInscripcion
            });
          }
        }

        const partidosOrdenados = [...partidos].sort(
          (a, b) => a.ronda - b.ronda || a.posicionEnRonda - b.posicionEnRonda
        );

        return res.status(200).json({
          torneo: {
            id: torneo.id,
            nombre: torneo.nombre,
            juego: torneo.juego,
            formato: torneo.formato,
            cupoMaximo: torneo.cupoMaximo,
            inscriptosActuales: torneo.inscriptosActuales,
            tamanoEquipo: torneo.tamanoEquipo,
            estado: torneo.estado
          },
          participantes: equiposPublicos,
          partidos: partidosOrdenados.map((partido) =>
            serializarPartidoPublico(partido, mapaNombresEquipos)
          )
        });
      } catch (error) {
        return next(error);
      }
    }
  };
}

