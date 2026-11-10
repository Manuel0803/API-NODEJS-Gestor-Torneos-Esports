import jwt from 'jsonwebtoken';
import { obtenerCorrelationId } from './contextoCorrelacion.js';

export const JWT_ISSUER = 'api-torneos-esports';
export const JWT_AUDIENCE = 'clientes-torneos-esports';
const JWT_EXPIRES_IN = '2h';

function responderNoAutenticado(res, req, detalle) {
  const correlationId = obtenerCorrelationId();

  res.setHeader('WWW-Authenticate', 'Bearer realm="api-torneos-esports"');
  return res.status(401).type('application/problem+json').json({
    type: 'https://api.torneos.esports/errores/no-autenticado',
    title: 'No autenticado',
    status: 401,
    detail: detalle,
    instance: req.originalUrl,
    ...(correlationId ? { correlationId } : {})
  });
}

function responderProhibido(res, req, detalle) {
  const correlationId = obtenerCorrelationId();

  return res.status(403).type('application/problem+json').json({
    type: 'https://api.torneos.esports/errores/prohibido',
    title: 'Acceso denegado',
    status: 403,
    detail: detalle,
    instance: req.originalUrl,
    ...(correlationId ? { correlationId } : {})
  });
}

export function firmarToken({ id, email, rol }, jwtSecret, opciones = {}) {
  return jwt.sign(
    {
      email,
      rol
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      subject: String(id),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: opciones.expiresIn ?? JWT_EXPIRES_IN
    }
  );
}

export function crearMiddlewareAutenticacion(jwtSecret) {
  return function verificarToken(req, res, next) {
    const encabezado = req.headers.authorization;

    if (typeof encabezado !== 'string' || !encabezado.startsWith('Bearer ')) {
      return responderNoAutenticado(
        res,
        req,
        'Se requiere un token de autenticacion en el encabezado Authorization: Bearer <token>.'
      );
    }

    const token = encabezado.slice('Bearer '.length).trim();

    if (!token) {
      return responderNoAutenticado(res, req, 'El token Bearer proporcionado esta vacio.');
    }

    try {
      const payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      });

      if (!payload || typeof payload !== 'object' || !payload.sub || !payload.rol) {
        return responderNoAutenticado(
          res,
          req,
          'El token no contiene las claims obligatorias (sub, rol).'
        );
      }

      req.usuario = {
        id: payload.sub,
        email: payload.email,
        rol: payload.rol
      };

      return next();
    } catch {
      return responderNoAutenticado(
        res,
        req,
        'El token de autenticacion es invalido o ha expirado.'
      );
    }
  };
}

export function exigirRoles(...rolesPermitidos) {
  return function middlewareRol(req, res, next) {
    if (!req.usuario) {
      return responderNoAutenticado(
        res,
        req,
        'Debe iniciar sesion para acceder a este recurso.'
      );
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return responderProhibido(
        res,
        req,
        `Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}.`
      );
    }

    return next();
  };
}

