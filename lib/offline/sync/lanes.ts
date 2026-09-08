import { canRetry, type OutboxStatus } from './retryPolicy';

export type LaneItem = {
  id: string;
  lane: string;
  status: OutboxStatus;
  attempts: number;
  nextRetryAt: number;
  queuedAt: number;
};

export type RunPlan<T extends LaneItem> = {
  /** Comandos a enviar, en orden de encolado. */
  runnable: T[];
  /** Carriles con un comando anterior que aún no está listo (backoff). */
  blockedLanes: Set<string>;
  /** Menor `nextRetryAt` futuro entre los comandos reintentables; null si no hay. */
  nextDueAt: number | null;
};

/**
 * Ordena el outbox respetando dependencias: dentro de un carril (misma ruta,
 * mismo negocio, mismo cliente) un comando no se envía mientras uno anterior
 * esté esperando su reintento. Así un cobro no llega al servidor antes que la
 * selección de parada que lo habilita.
 *
 * Los comandos terminales (failed/conflict) no bloquean: esperan acción del
 * usuario y los siguientes deben poder intentarlo o fallar por sí mismos.
 */
export function planOutboxRun<T extends LaneItem>(items: T[], now = Date.now()): RunPlan<T> {
  const ordered = [...items].sort((a, b) => a.queuedAt - b.queuedAt);
  const blockedLanes = new Set<string>();
  const runnable: T[] = [];
  let nextDueAt: number | null = null;

  for (const item of ordered) {
    const retryable = item.status === 'pending' || item.status === 'error';
    if (!retryable) continue;
    if (blockedLanes.has(item.lane)) continue;
    if (canRetry(item.status, item.attempts, item.nextRetryAt, now)) {
      runnable.push(item);
      continue;
    }
    if (item.nextRetryAt > now) {
      blockedLanes.add(item.lane);
      if (nextDueAt === null || item.nextRetryAt < nextDueAt) nextDueAt = item.nextRetryAt;
    }
  }

  return { runnable, blockedLanes, nextDueAt };
}
