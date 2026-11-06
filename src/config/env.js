import { z } from 'zod';

const esquemaEnv = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().min(1),
  EXTERNAL_ADAPTER_MODE: z.enum(['mock', 'http']).default('mock'),
  DJANGO_SERVICE_URL: z.string().url(),
  DJANGO_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)
});

export function validarEnv(origen = process.env) {
  const resultado = esquemaEnv.safeParse(origen);

  if (!resultado.success) {
    const detalles = resultado.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Configuracion de entorno invalida: ${detalles}`);
  }

  return resultado.data;
}

export function cargarEnv(origen = process.env) {
  try {
    return validarEnv(origen);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}