/**
 * Cobro desde una parada de ruta. Reglas puras (sin red ni base local):
 *
 * - Un cobro solo completa la parada si sigue siendo la «actual» de una ruta
 *   en curso. Tras el primer cobro (o si la ruta cambió), un segundo pago en
 *   la misma pantalla es un abono normal: antes se mandaba otra vez la parada,
 *   el servidor lo rechazaba («Solo puede cobrarse la parada actual») y, sin
 *   señal, se marcaba la parada de nuevo y se adelantaba otra.
 * - Si se entra al negocio sin la parada (desde Cartera, Negocios o «Ver
 *   negocio»), pero es la parada actual de una ruta en curso del gestor, se
 *   ofrece contarlo en la ruta.
 */
import type { CollectionRoute } from './types';

/** Estado conocido de una parada y su ruta; null = no se sabe (decide el servidor). */
export type KnownStopState = {
  stopId: string;
  routeId: string;
  negocioId: string;
  position: number;
  stopStatus: string;
  routeStatus: string | null;
  routeDate: string | null;
};

export const STOP_NOT_CURRENT_PATTERN = /solo puede cobrarse la parada actual/i;

/** El servidor rechazó el cobro de la parada porque ya no es la actual. */
export function isStopNoLongerCurrentError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return STOP_NOT_CURRENT_PATTERN.test(message);
}

/**
 * ¿La parada todavía cuenta el cobro? true/false si se sabe; null si no hay
 * dato (la ruta no está ni en el teléfono ni en caché): entonces se manda la
 * parada y el servidor decide.
 */
export function stopStillCurrent(state: Pick<KnownStopState, 'stopStatus' | 'routeStatus'> | null): boolean | null {
  if (!state) return null;
  if (state.routeStatus && state.routeStatus !== 'activa') return false;
  return state.stopStatus === 'actual';
}

/** Paradas de la ruta guardada en caché, con el estado de la ruta. */
export function stopStatesFromRoute(route: CollectionRoute | null | undefined): KnownStopState[] {
  if (!route) return [];
  return route.stops.map((stop) => ({
    stopId: stop.id,
    routeId: route.id,
    negocioId: stop.negocio_id,
    position: stop.position,
    stopStatus: stop.status,
    routeStatus: route.status,
    routeDate: route.route_date,
  }));
}

/**
 * Parada que se ofrece vincular al cobro: la «actual» de una ruta en curso
 * para ese negocio. Si hay varias (rutas viejas sin cerrar), la de la fecha
 * más reciente que no sea futura.
 */
export function pickSuggestedStop(
  states: KnownStopState[],
  negocioId: string,
  today: string
): KnownStopState | null {
  const candidates = states
    .filter(
      (state) =>
        state.negocioId === negocioId &&
        state.stopStatus === 'actual' &&
        state.routeStatus === 'activa' &&
        (!state.routeDate || state.routeDate <= today)
    )
    .sort((a, b) => (b.routeDate || '').localeCompare(a.routeDate || ''));
  return candidates[0] ?? null;
}
