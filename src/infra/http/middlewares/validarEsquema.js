import { z } from 'zod';
import { obtenerCorrelationId } from './contextoCorrelacion.js';

const CLAVES_PROHIBIDAS_PROTOTIPO = new Set(['__proto__', 'prototype', 'constructor']);

function contieneClavesDePrototipo(valor) {
  if (valor === null || typeof valor !== 'object') {
    return false;
  }

  if (Object.getPrototypeOf(valor) !== Object.prototype && !Array.isArray(valor)) {
    return true;
  }

  const clavesPropias = Object.getOwnPropertyNames(valor);
  for (const clave of clavesPropias) {
    if (CLAVES_PROHIBIDAS_PROTOTIPO.has(clave)) {
      return true;
    }

    if (contieneClavesDePrototipo(valor[clave])) {
      return true;
    }
  }

  return false;
}

export const esquemaObjetoSeguro = z.custom(
  (valor) => !contieneClavesDePrototipo(valor),
  {
    message: 'El objeto contiene propiedades no permitidas.'
  }
);

export function validarEsquema({ body, params, query } = {}) {
  return function middlewareValidacion(req, res, next) {
    if (
      contieneClavesDePrototipo(req.body) ||
      contieneClavesDePrototipo(req.params) ||
      contieneClavesDePrototipo(req.query)
    ) {
      const correlationId = obtenerCorrelationId();
      return res.status(400).type('application/problem+json').json({
        type: 'https://api.torneos.esports/errores/datos-invalidos',
        title: 'Datos de entrada invalidos',
        status: 400,
        detail: 'La estructura de la peticion contiene propiedades no permitidas.',
        instance: req.originalUrl,
        ...(correlationId ? { correlationId } : {})
      });
    }

    try {
      if (params) {
        req.params = params.parse(req.params);
      }

      if (query) {
        req.query = query.parse(req.query);
      }

      if (body) {
        req.body = body.parse(req.body);
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

