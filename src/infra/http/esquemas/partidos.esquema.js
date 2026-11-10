import { z } from 'zod';

const parametrosPartido = z.object({
  id: z.string().uuid()
}).strict();

const motivo = z.string().trim().min(3).max(500);

export const esquemaReportarResultado = {
  params: parametrosPartido,
  body: z.object({
    equipoId: z.string().uuid(),
    resultado: z.enum(['GANA_A', 'GANA_B']),
    evidenciaUrl: z.string().url().max(2048).optional()
  }).strict()
};

export const esquemaResolverDisputa = {
  params: parametrosPartido,
  body: z.object({
    ganadorId: z.string().uuid(),
    motivo
  }).strict()
};

export const esquemaAnularPartido = {
  params: parametrosPartido,
  body: z.object({
    resolucion: z.enum(['REJUGAR', 'VICTORIA_ADMINISTRATIVA']),
    ganadorId: z.string().uuid().optional(),
    motivo
  }).strict()
};
