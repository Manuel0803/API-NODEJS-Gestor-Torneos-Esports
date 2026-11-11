import { ServicioExternoNoDisponibleError } from '../../dominio/errores/index.js';
import { obtenerCorrelationId } from '../http/middlewares/contextoCorrelacion.js';

export async function postJson({ fetchFn, url, cuerpo, timeoutMs, servicio }) {
  const correlationId = obtenerCorrelationId();
  try {
    const respuesta = await fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (respuesta.status >= 500) {
      throw new ServicioExternoNoDisponibleError(servicio, `Respondio con estado ${respuesta.status}`);
    }
    const datos = await respuesta.json().catch(() => null);
    return { status: respuesta.status, datos };
  } catch (error) {
    if (error instanceof ServicioExternoNoDisponibleError) throw error;
    const motivo = error?.name === 'TimeoutError'
      ? `Sin respuesta en ${timeoutMs} ms`
      : 'No se pudo conectar con el servicio';
    throw new ServicioExternoNoDisponibleError(servicio, motivo);
  }
}

export function normalizarBaseUrl(baseUrl) {
  return String(baseUrl).replace(/\/+$/, '');
}
