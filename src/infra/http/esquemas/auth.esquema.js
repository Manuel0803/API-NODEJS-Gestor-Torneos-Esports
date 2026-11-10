import { z } from 'zod';
import { ROLES_USUARIO } from '../../../dominio/entidades/Usuario.js';

export const esquemaRegistro = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    nombreUsuario: z.string().min(3).max(100),
    gamerTag: z.string().min(2).max(100),
    rol: z.enum([
      ROLES_USUARIO.ORGANIZADOR,
      ROLES_USUARIO.ARBITRO,
      ROLES_USUARIO.CAPITAN,
      ROLES_USUARIO.JUGADOR
    ])
  })
  .strict();

export const esquemaLogin = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(128)
  })
  .strict();

