import { createHash } from 'node:crypto';
import { obtenerCorrelationId } from './contextoCorrelacion.js';

function ordenarObjetoCanonico(valor) {
  if (valor === null || typeof valor !== 'object') {
    return valor;
  }

  if (Array.isArray(valor)) {
    return valor.map(ordenarObjetoCanonico);
  }

  const ordenado = {};
  for (const clave of Object.keys(valor).sort()) {
    ordenado[clave] = ordenarObjetoCanonico(valor[clave]);
  }
  return ordenado;
}

export function calcularHuellaPeticion({ metodo, ruta, body }) {
  const cuerpoCanonico = JSON.stringify(ordenarObjetoCanonico(body ?? {}));
  return createHash('sha256')
    .update(`${metodo.toUpperCase()}:${ruta}:${cuerpoCanonico}`)
    .digest('hex');
}

export function crearMiddlewareIdempotencia({
  unidadDeTrabajo,
  obligatoria = false
} = {}) {
  const enVuelo = new Set();

  return async function middlewareIdempotencia(req, res, next) {
    const encabezado = req.headers['idempotency-key'];
    const clave = typeof encabezado === 'string' ? encabezado.trim() : '';

    if (!clave) {
      if (!obligatoria) {
        return next();
      }

      const correlationId = obtenerCorrelationId();
      return res.status(400).type('application/problem+json').json({
        type: 'https://api.torneos.esports/errores/datos-invalidos',
        title: 'Peticion invalida',
        status: 400,
        detail: 'Se requiere el encabezado Idempotency-Key.',
        instance: req.originalUrl,
        ...(correlationId ? { correlationId } : {})
      });
    }

    const usuarioId = req.usuario?.id ?? req.user?.sub ?? 'anonimo';
    const repoIdempotencia = unidadDeTrabajo?.clavesIdempotencia;

    if (!repoIdempotencia) {
      return next();
    }

    const huellaPeticion = calcularHuellaPeticion({
      metodo: req.method,
      ruta: req.baseUrl + req.path,
      body: req.body
    });

    const llaveEnVuelo = `${usuarioId}:${clave}`;

    try {
      const registroExistente = await repoIdempotencia.obtener(usuarioId, clave);

      if (registroExistente) {
        if (registroExistente.huellaPeticion !== huellaPeticion) {
          const correlationId = obtenerCorrelationId();
          return res.status(422).type('application/problem+json').json({
            type: 'https://api.torneos.esports/errores/entidad-no-procesable',
            title: 'Operacion no procesable',
            status: 422,
            detail: 'La clave de idempotencia no coincide con la operacion solicitada.',
            instance: req.originalUrl,
            ...(correlationId ? { correlationId } : {})
          });
        }

        res.setHeader('Idempotent-Replayed', 'true');
        return res
          .status(registroExistente.codigoHttp)
          .json(registroExistente.cuerpoRespuesta);
      }

      if (enVuelo.has(llaveEnVuelo)) {
        const correlationId = obtenerCorrelationId();
        return res.status(409).type('application/problem+json').json({
          type: 'https://api.torneos.esports/errores/conflicto-estado',
          title: 'Conflicto en la peticion',
          status: 409,
          detail: 'La operacion ya se encuentra en procesamiento.',
          instance: req.originalUrl,
          ...(correlationId ? { correlationId } : {})
        });
      }

      enVuelo.add(llaveEnVuelo);
      res.on('close', () => {
        enVuelo.delete(llaveEnVuelo);
      });

      const jsonOriginal = res.json.bind(res);

      res.json = (cuerpo) => {
        const codigoHttp = res.statusCode;

        if (codigoHttp >= 200 && codigoHttp < 300) {
          Promise.resolve(
            repoIdempotencia.guardar({
              usuarioId,
              clave,
              huellaPeticion,
              codigoHttp,
              cuerpoRespuesta: cuerpo
            })
          )
            .catch(() => {})
            .finally(() => {
              enVuelo.delete(llaveEnVuelo);
            });
        } else {
          enVuelo.delete(llaveEnVuelo);
        }

        return jsonOriginal(cuerpo);
      };

      return next();
    } catch (error) {
      enVuelo.delete(llaveEnVuelo);
      return next(error);
    }
  };
}

