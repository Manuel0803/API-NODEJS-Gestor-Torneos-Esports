import { z } from 'zod';

export const esquemaCrearEquipo = {
  body: z.object({
    nombre: z.string().trim().min(3).max(50)
  }).strict()
};

export const esquemaListarEquipos = {
  query: z.object({}).strict()
};

export const esquemaAgendaJugador = {
  query: z.object({}).strict()
};
