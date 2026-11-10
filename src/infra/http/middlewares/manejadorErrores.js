import { ErrorDeDominio } from '../../../dominio/errores/index.js';
import { obtenerCorrelationId, logger } from './contextoCorrelacion.js';

const MAPA_ERRORES_DOMINIO = {
  ReporteInvalidoError: {
    status: 400,
    type: 'https://api.torneos.esports/errores/datos-invalidos',
    title: 'Datos de entrada invalidos'
  },
  PermisoDenegadoError: {
    status: 403,
    type: 'https://api.torneos.esports/errores/no-autorizado',
    title: 'Operacion no autorizada'
  },
  EntidadNoEncontradaError: {
    status: 404,
    type: 'https://api.torneos.esports/errores/recurso-no-encontrado',
    title: 'Recurso no encontrado'
  },
  PartidoNoModificableError: {
    status: 409,
    type: 'https://api.torneos.esports/errores/conflicto-estado',
    title: 'Conflicto con el estado actual del recurso'
  },
  ReglaDeNegocioError: {
    status: 409,
    type: 'https://api.torneos.esports/errores/conflicto-regla-negocio',
    title: 'Violacion de regla de negocio'
  },
  CupoAgotadoError: {
    status: 409,
    type: 'https://api.torneos.esports/errores/cupo-agotado',
    title: 'Cupo del torneo agotado'
  },
  JugadorYaInscriptoError: {
    status: 409,
    type: 'https://api.torneos.esports/errores/jugador-ya-inscripto',
    title: 'Jugador ya inscripto en otro equipo del torneo'
  },
  TorneoCerradoError: {
    status: 422,
    type: 'https://api.torneos.esports/errores/torneo-cerrado',
    title: 'El torneo no admite esta operacion en su estado actual'
  },
  CheckinFueraDeVentanaError: {
    status: 422,
    type: 'https://api.torneos.esports/errores/checkin-fuera-de-ventana',
    title: 'Operacion fuera de la ventana de check-in'
  },
  ServicioExternoNoDisponibleError: {
    status: 503,
    type: 'https://api.torneos.esports/errores/servicio-externo-no-disponible',
    title: 'Servicio externo de validacion no disponible'
  }
};

function responderProblema(res, req, { status, type, title, detail, errores }) {
  const correlationId = obtenerCorrelationId();

  res.status(status).type('application/problem+json').json({
    type,
    title,
    status,
    detail,
    instance: req.originalUrl,
    ...(correlationId ? { correlationId } : {}),
    ...(errores ? { errors: errores } : {})
  });
}

export function middlewareRutaNoEncontrada(req, res) {
  responderProblema(res, req, {
    status: 404,
    type: 'https://api.torneos.esports/errores/ruta-no-encontrada',
    title: 'Ruta no encontrada',
    detail: `No existe el recurso ${req.method} ${req.originalUrl}`
  });
}

export function manejadorErrores(err, req, res, _next) {
  if (err?.type === 'entity.parse.failed') {
    return responderProblema(res, req, {
      status: 400,
      type: 'https://api.torneos.esports/errores/json-invalido',
      title: 'Cuerpo JSON invalido',
      detail: 'El cuerpo de la peticion no contiene un JSON valido.'
    });
  }

  if (err?.name === 'ZodError' && Array.isArray(err.issues)) {
    const errores = err.issues.map((issue) => ({
      campo: issue.path.join('.'),
      mensaje: issue.message
    }));

    return responderProblema(res, req, {
      status: 400,
      type: 'https://api.torneos.esports/errores/validacion-esquema',
      title: 'Error de validacion en la peticion',
      detail: 'Uno o mas campos de la peticion son invalidos o no estan permitidos.',
      errores
    });
  }

  if (err instanceof ErrorDeDominio) {
    const claveError = err.codigo ?? err.name;
    const definicion = MAPA_ERRORES_DOMINIO[claveError] ?? {
      status: 400,
      type: 'https://api.torneos.esports/errores/regla-de-negocio',
      title: 'Violacion de regla de negocio'
    };

    if (definicion.status >= 500) {
      logger.error('Fallo en dependencia externa (fail-closed)', {
        codigo: claveError,
        detalle: err.message,
        ruta: req.originalUrl
      });
    }

    return responderProblema(res, req, {
      status: definicion.status,
      type: definicion.type,
      title: definicion.title,
      detail: err.message
    });
  }

  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    return responderProblema(res, req, {
      status: err.status,
      type: err.type ?? 'https://api.torneos.esports/errores/peticion-invalida',
      title: err.title ?? 'Error en la peticion',
      detail: err.message
    });
  }

  logger.error('Error interno no controlado', {
    error: err?.message ?? 'Error desconocido',
    ruta: req.originalUrl,
    metodo: req.method
  });

  return responderProblema(res, req, {
    status: 500,
    type: 'https://api.torneos.esports/errores/error-interno',
    title: 'Error interno del servidor',
    detail: 'Ocurrio un error interno inesperado.'
  });
}

