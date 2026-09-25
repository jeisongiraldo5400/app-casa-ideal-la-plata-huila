import { laneForCommand, REJECTED_ROW_SYNC_STATUS, type OutboxCommandType } from './types';

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

/** Estados de comandos que el servidor rechazó y esperan decisión del usuario. */
export const REJECTED_OUTBOX_STATUSES = ['failed', 'conflict'] as const;

/**
 * Estado de envío de un negocio creado en el teléfono:
 * - `pending`: guardado sin señal, todavía no confirmado por el servidor;
 * - `rejected`: el servidor no lo aceptó (o el usuario lo descartó).
 * Los negocios ya confirmados no aparecen en el mapa.
 */
export type NegocioSyncState = 'pending' | 'rejected';

export type LocalNegocioSyncRow = {
  id: string;
  /** `sync_status` de la fila local: 'synced' | 'pending' | 'rejected'. */
  rowSyncStatus: string;
};

/**
 * Negocios que el usuario descartó desde «Cambios sin sincronizar»: su
 * `create_negocio` quedó en `discarded` y ningún otro comando de creación
 * sigue vivo. La fila local se conserva marcada como rechazada (el cliente ya
 * firmó), pero no debe salir en la lista: se descartó a propósito y la cola ya
 * no lo muestra, así que el distintivo llevaría a un callejón sin salida.
 */
export function discardedNegocioIds(outbox: OutboxCommandLike[]): Set<string> {
  const discarded = new Set<string>();
  const alive = new Set<string>();
  for (const item of outbox) {
    if (item.type !== 'create_negocio') continue;
    const negocioId = String(item.payload?.negocioId || '');
    if (!negocioId) continue;
    if (item.status === 'discarded') discarded.add(negocioId);
    else alive.add(negocioId);
  }
  for (const negocioId of alive) discarded.delete(negocioId);
  return discarded;
}

/**
 * Mapa id → estado de envío para pintar el distintivo de cada tarjeta de la
 * lista con una sola lectura, sin consultar la cola por cada fila.
 *
 * Manda el comando `create_negocio` de la cola (la misma fuente que «Cambios
 * sin sincronizar»): tras «Reintentar» la fila local sigue marcada como
 * rechazada, pero el comando ya volvió a `pending` y se enviará. Sin comando
 * en la cola se usa el estado de la fila local. Los descartados por el
 * usuario (`discardedNegocioIds`) no entran en el mapa.
 */
export function buildNegocioSyncStateMap(
  outbox: OutboxCommandLike[],
  localRows: LocalNegocioSyncRow[]
): Record<string, NegocioSyncState> {
  const states: Record<string, NegocioSyncState> = {};
  for (const row of localRows) {
    if (row.rowSyncStatus === 'pending') states[row.id] = 'pending';
    else if (row.rowSyncStatus === REJECTED_ROW_SYNC_STATUS) states[row.id] = 'rejected';
  }
  const discarded = discardedNegocioIds(outbox);
  for (const negocioId of discarded) delete states[negocioId];
  for (const item of outbox) {
    if (item.type !== 'create_negocio') continue;
    const negocioId = String(item.payload?.negocioId || '');
    if (!negocioId || discarded.has(negocioId)) continue;
    if ((UNSETTLED_OUTBOX_STATUSES as readonly string[]).includes(item.status)) {
      states[negocioId] = 'pending';
    } else if ((REJECTED_OUTBOX_STATUSES as readonly string[]).includes(item.status)) {
      states[negocioId] = 'rejected';
    } else if (item.status === 'done') {
      // Confirmado por el servidor: el distintivo desaparece aunque la fila
      // local aún no se haya reescrito.
      delete states[negocioId];
    }
  }
  return states;
}
