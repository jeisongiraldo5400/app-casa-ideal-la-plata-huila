import { laneForCommand, type OutboxCommandType } from './types';

/** Estados de comandos que todavía pueden cambiar el saldo del negocio en el servidor. */
export const UNSETTLED_OUTBOX_STATUSES = ['pending', 'syncing', 'error'] as const;

/** Comandos que cambian saldos, paradas o rutas en el servidor. */
const BALANCE_COMMAND_TYPES = new Set<string>([
  'register_pago',
  'register_route_pago',
  'update_route_stop',
  'start_route',
  'finish_route',
  'select_route_stop',
] satisfies OutboxCommandType[]);

export type OutboxCommandLike = {
  type: string;
  status: string;
  payload: Record<string, unknown>;
};

export type NegocioSyncScope = {
  negocioId: string;
  /** Ruta de la parada desde la que se cobra (si se conoce). */
  routeId?: string | null;
  routeStopId?: string | null;
};

/**
 * ¿Hay comandos sin confirmar que afecten al negocio? El pronto pago liquida el
 * saldo del servidor: si un abono (o la selección de la parada que lo habilita)
 * sigue en cola, el total que ve el usuario no es el del servidor y el
 * comando encolado fallaría después contra un negocio ya cerrado.
 *
 * Cuenta el carril `negocio:<id>`, cualquier comando cuyo payload apunte al
 * negocio (los abonos de ruta viajan por `route:<routeId>`), los de la ruta de
 * la parada actual y los de la propia parada.
 */
export function outboxAffectsNegocio(items: OutboxCommandLike[], scope: NegocioSyncScope): boolean {
  const negocioLane = `negocio:${scope.negocioId}`;
  const routeLane = scope.routeId ? `route:${scope.routeId}` : null;
  return items.some((item) => {
    if (!(UNSETTLED_OUTBOX_STATUSES as readonly string[]).includes(item.status)) return false;
    // Adjuntar un soporte no mueve saldos; un soporte que no logra subir no
    // debe impedir liquidar el negocio.
    if (!BALANCE_COMMAND_TYPES.has(item.type)) return false;
    const payload = item.payload || {};
    if (payload.negocioId === scope.negocioId) return true;
    if (scope.routeStopId && payload.stopId === scope.routeStopId) return true;
    if (scope.routeStopId && payload.routeStopId === scope.routeStopId) return true;
    const lane = laneForCommand(item.type as OutboxCommandType, payload);
    return lane === negocioLane || (routeLane !== null && lane === routeLane);
  });
}
