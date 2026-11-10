import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Usuario } from '../../../dominio/entidades/Usuario.js';
import { ReglaDeNegocioError } from '../../../dominio/errores/index.js';
import { firmarToken } from '../middlewares/autenticacion.js';
import { obtenerCorrelationId } from '../middlewares/contextoCorrelacion.js';

const OPCIONES_ARGON2 = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

function serializarUsuarioPublico(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    nombreUsuario: usuario.nombreUsuario,
    gamerTag: usuario.gamerTag,
    rol: usuario.rol,
    puntosElo: usuario.puntosElo,
    creadoEn: usuario.creadoEn
  };
}

export function crearControladorAuth({ unidadDeTrabajo, jwtSecret }) {
  return {
    async registrar(req, res, next) {
      try {
        const { email, password, nombreUsuario, gamerTag, rol } = req.body;

        const usuarioCreado = await unidadDeTrabajo.ejecutar(async ({ usuarios }) => {
          const existente = await usuarios.obtenerPorEmail(email);
          if (existente) {
            throw new ReglaDeNegocioError('El email ingresado ya se encuentra registrado.');
          }

          const passwordHash = await argon2.hash(password, OPCIONES_ARGON2);
          const nuevoUsuario = new Usuario({
            id: randomUUID(),
            email,
            passwordHash,
            nombreUsuario,
            gamerTag,
            rol
          });

          await usuarios.guardar(nuevoUsuario);
          return nuevoUsuario;
        });

        return res.status(201).json(serializarUsuarioPublico(usuarioCreado));
      } catch (error) {
        return next(error);
      }
    },

    async login(req, res, next) {
      try {
        const { email, password } = req.body;
        const usuario = await unidadDeTrabajo.usuarios.obtenerPorEmail(email);

        if (!usuario) {
          const correlationId = obtenerCorrelationId();
          res.setHeader('WWW-Authenticate', 'Bearer realm="api-torneos-esports"');
          return res.status(401).type('application/problem+json').json({
            type: 'https://api.torneos.esports/errores/credenciales-invalidas',
            title: 'Credenciales invalidas',
            status: 401,
            detail: 'El email o la contrasena son incorrectos.',
            instance: req.originalUrl,
            ...(correlationId ? { correlationId } : {})
          });
        }

        const coincide = await argon2.verify(usuario.passwordHash, password);
        if (!coincide) {
          const correlationId = obtenerCorrelationId();
          res.setHeader('WWW-Authenticate', 'Bearer realm="api-torneos-esports"');
          return res.status(401).type('application/problem+json').json({
            type: 'https://api.torneos.esports/errores/credenciales-invalidas',
            title: 'Credenciales invalidas',
            status: 401,
            detail: 'El email o la contrasena son incorrectos.',
            instance: req.originalUrl,
            ...(correlationId ? { correlationId } : {})
          });
        }

        const accessToken = firmarToken(
          {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol
          },
          jwtSecret
        );

        return res.status(200).json({
          accessToken,
          tokenType: 'Bearer',
          usuario: serializarUsuarioPublico(usuario)
        });
      } catch (error) {
        return next(error);
      }
    },

    async perfilActual(req, res, next) {
      try {
        const usuario = await unidadDeTrabajo.usuarios.obtenerPorId(req.usuario.id);
        if (!usuario) {
          const correlationId = obtenerCorrelationId();
          return res.status(404).type('application/problem+json').json({
            type: 'https://api.torneos.esports/errores/recurso-no-encontrado',
            title: 'Recurso no encontrado',
            status: 404,
            detail: 'Usuario no encontrado.',
            instance: req.originalUrl,
            ...(correlationId ? { correlationId } : {})
          });
        }

        return res.status(200).json(serializarUsuarioPublico(usuario));
      } catch (error) {
        return next(error);
      }
    }
  };
}

