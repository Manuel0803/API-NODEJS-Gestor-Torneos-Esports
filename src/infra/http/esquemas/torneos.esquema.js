import { z } from 'zod';

export const esquemaParametroId = z
  .object({
    id: z.string().uuid()
  })
  .strict();

export const esquemaCrearTorneo = z
  .object({
    nombre: z.string().min(3).max(150),
    juego: z.string().min(2).max(100),
    cupoMaximo: z.number().int().min(2),
    tamanoEquipo: z.number().int().min(1),
    semillaSorteo: z.string().min(1).max(100),
    fechaCierreInscripcion: z.string().datetime(),
    inicioCheckin: z.string().datetime(),
    finCheckin: z.string().datetime()
  })
  .strict();

export const esquemaInscribirEquipo = z
  .object({
    equipoId: z.string().uuid(),
    jugadorIds: z.array(z.string().uuid()).min(1)
  })
  .strict();

export const esquemaConfirmarCheckin = z
  .object({
    equipoId: z.string().uuid()
  })
  .strict();

export const esquemaSimulacionMasiva = z
  .object({
    modo: z.enum(['ingenuo', 'worker']).default('worker'),
    cantidadEquipos: z.number().int().min(1024).max(4096).default(1024),
    cantidadJugadoresElo: z.number().int().min(1000).max(20000).default(5000),
    rondasHistoricas: z.number().int().min(10).max(500).default(120),
    semilla: z.string().min(1).max(100).default('torneo-masivo-1024')
  })
  .strict();

