import { formatLastDownloadTime } from '@/lib/offline/sync/downloadData';

/**
 * ¿Se puede trabajar esta ruta sin señal? En esta versión nada baja solo: la
 * ruta queda en el teléfono cuando el gestor pulsa «Descargar ruta».
 *
 * - 'no_guardada': la ruta no está en el teléfono.
 * - 'pendiente': está, pero cambió en el servidor (paradas agregadas, quitadas
 *   o reordenadas) o a alguna parada le falta su negocio, cuotas o cliente.
 * - 'guardada': ruta, paradas y los negocios de cada parada están en el teléfono.
 */
export type RouteOfflineState = 'no_guardada' | 'pendiente' | 'guardada';

export type RouteOfflineStatus = {
  state: RouteOfflineState;
  /** Paradas cuyo negocio no quedó completo en el teléfono (número de negocio). */
  missingNegocioNumeros: number[];
  /** Las paradas del servidor no coinciden con las guardadas. */
  structureChanged: boolean;
  /** Última descarga manual (ms) o null. */
  downloadedAt: number | null;
};

export type LocalRouteSnapshot = {
  routeExists: boolean;
  /** negocio_id de las paradas guardadas, en orden de posición. */
  stopNegocioIds: string[];
  /** Negocios con fila, cliente y cuotas en el teléfono. */
  readyNegocioIds: Set<string>;
};

export function evaluateRouteOfflineStatus(input: {
  /** Paradas vistas en el servidor (en orden); null si no hay señal. */
  serverStops: { negocio_id: string; negocio_numero: number }[] | null;
  local: LocalRouteSnapshot;
  downloadedAt: number | null;
}): RouteOfflineStatus {
  const { local, serverStops, downloadedAt } = input;
  if (!local.routeExists) {
    return { state: 'no_guardada', missingNegocioNumeros: [], structureChanged: false, downloadedAt };
  }
  const structureChanged =
    serverStops != null &&
    (serverStops.length !== local.stopNegocioIds.length ||
      serverStops.some((stop, index) => stop.negocio_id !== local.stopNegocioIds[index]));
  const numeros = new Map((serverStops || []).map((stop) => [stop.negocio_id, stop.negocio_numero]));
  const stops = serverStops ? serverStops.map((stop) => stop.negocio_id) : local.stopNegocioIds;
  const missingNegocioNumeros = stops
    .filter((negocioId) => !local.readyNegocioIds.has(negocioId))
    .map((negocioId) => numeros.get(negocioId) ?? 0);
  const state: RouteOfflineState = structureChanged || missingNegocioNumeros.length ? 'pendiente' : 'guardada';
  return { state, missingNegocioNumeros, structureChanged, downloadedAt };
}

/** Texto corto para la tarjeta de la ruta. */
export function routeOfflineLabel(status: RouteOfflineStatus, now = Date.now()): string {
  if (status.state === 'guardada') {
    const time = formatLastDownloadTime(status.downloadedAt, now);
    return time ? `Guardada en el teléfono · ${time}` : 'Guardada en el teléfono';
  }
  if (status.state === 'pendiente') {
    if (status.structureChanged) return 'Pendiente de descargar: la ruta cambió después de guardarla';
    const count = status.missingNegocioNumeros.length;
    return `Pendiente de descargar: ${count} ${count === 1 ? 'parada' : 'paradas'} sin datos en el teléfono`;
  }
  return 'Pendiente de descargar: la ruta no está en el teléfono';
}
