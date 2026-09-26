import { CollectionRouteStop, RouteStatus, StopStatus } from './types';

/** Visitas atendidas: el gestor llegó y dejó un resultado. */
export const VISITED_STOP_STATUSES: StopStatus[] = ['cobrado', 'sin_pago', 'reprogramado', 'omitido'];
/** Paradas que ya no admiten acciones (las atendidas y las no visitadas al cerrar). */
export const FINAL_STOP_STATUSES: StopStatus[] = [...VISITED_STOP_STATUSES, 'no_visitada'];

export function isFinalStopStatus(status: StopStatus) {
  return FINAL_STOP_STATUSES.includes(status);
}

export function isVisitedStopStatus(status: StopStatus) {
  return VISITED_STOP_STATUSES.includes(status);
}

/** Paradas que quedarían «No visitada» si se cierra la jornada ahora. */
export function countPendingStops(stops: Pick<CollectionRouteStop, 'status'>[]) {
  return stops.filter((stop) => stop.status === 'pendiente' || stop.status === 'actual').length;
}

/** Resumen de la jornada: visitadas, cobradas, no visitadas y por visitar. */
export function getRouteOutcomeSummary(stops: Pick<CollectionRouteStop, 'status'>[]) {
  return {
    visited: stops.filter((stop) => isVisitedStopStatus(stop.status)).length,
    collected: stops.filter((stop) => stop.status === 'cobrado').length,
    notVisited: stops.filter((stop) => stop.status === 'no_visitada').length,
    pending: countPendingStops(stops),
  };
}

/** Progreso de visitas: las no visitadas no cuentan como hechas. */
export function getRouteProgress(stops: CollectionRouteStop[]) {
  const completed = stops.filter((stop) => isVisitedStopStatus(stop.status)).length;
  return {
    completed,
    total: stops.length,
    percentage: stops.length ? Math.round((completed / stops.length) * 100) : 0,
  };
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function getNextActionableStop(stops: CollectionRouteStop[]) {
  return stops.find((stop) => stop.status === 'actual') || stops.find((stop) => stop.status === 'pendiente') || null;
}


export type RouteSummaryLike = { id: string; route_date: string; status: RouteStatus };

/**
 * Reparte las rutas del gestor para la pantalla principal:
 * - `today`: la ruta de hoy que no esté cancelada (en borrador, en curso o
 *   completada). Solo puede haber una por día, así que si ya se completó no se
 *   ofrece crear otra (el servidor la rechazaría).
 * - `unfinished`: rutas de otros días que quedaron abiertas; no impiden crear
 *   la de hoy, pero hay que completarlas o cancelarlas.
 * - `history`: el resto.
 */
export function groupRoutesForHome<T extends RouteSummaryLike>(routes: T[], today: string) {
  const todayRoute = routes.find((route) => route.route_date === today && route.status !== 'cancelada') || null;
  const unfinished = routes.filter(
    (route) => route.id !== todayRoute?.id && (route.status === 'activa' || route.status === 'borrador')
  );
  const history = routes.filter((route) => route.id !== todayRoute?.id && !unfinished.includes(route));
  return { today: todayRoute, unfinished, history };
}
