/**
 * Estados del outbox:
 * - pending / error: el comando se volverá a intentar.
 * - syncing: en vuelo (se recupera a pending si el proceso muere).
 * - failed / conflict: terminal; requiere acción del usuario (reintentar o descartar).
 * - done / discarded: cerrados.
 */
export type OutboxStatus =
  | 'pending'
  | 'syncing'
  | 'error'
  | 'failed'
  | 'conflict'
  | 'done'
  | 'discarded';

export type RetryDecision = 'retry' | 'network' | 'fail' | 'conflict';

const MAX_ATTEMPTS = 8;
const BACKOFF_MS = [1000, 4000, 15000, 60000, 120000, 300000, 300000, 300000];
/** Espera antes de volver a probar tras un fallo de red (no consume intentos). */
export const NETWORK_RETRY_DELAY_MS = 15000;

export const RETRYABLE_STATUSES: OutboxStatus[] = ['pending', 'error'];
export const TERMINAL_STATUSES: OutboxStatus[] = ['failed', 'conflict'];

export function nextRetryAt(attempts: number, now = Date.now()): number {
  const index = Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1);
  return now + BACKOFF_MS[index];
}

export function isNetworkErrorMessage(message: string): boolean {
  return /network|fetch|failed to connect|internet|offline|timeout|timed out|socket|econn|load failed/i.test(
    message
  );
}

/**
 * Clasifica el mensaje devuelto por el servidor.
 * - network: la petición no llegó; se reintenta sin consumir intentos.
 * - conflict: el dato ya existe con otra identidad; requiere revisión.
 * - fail: regla de negocio; el servidor nunca lo aceptará tal cual.
 * - retry: error desconocido o transitorio (consume intentos).
 */
export function classifyPushError(message: string): RetryDecision {
  const text = message.toLowerCase();
  if (isNetworkErrorMessage(text)) return 'network';
  if (
    text.includes('duplicado') ||
    text.includes('id_number') ||
    text.includes('ya existe') ||
    text.includes('clave de idempotencia ya fue usada')
  ) {
    return 'conflict';
  }
  if (
    text.includes('saldo') ||
    text.includes('sin permiso') ||
    text.includes('no autenticado') ||
    text.includes('no encontrad') ||
    text.includes('no válido') ||
    text.includes('no valido') ||
    text.includes('monto debe ser mayor') ||
    text.includes('solo se pueden registrar pagos') ||
    text.includes('solo puede cobrarse') ||
    text.includes('solo puede actualizarse') ||
    text.includes('no está activa') ||
    text.includes('no esta activa') ||
    text.includes('no está disponible') ||
    text.includes('no esta disponible') ||
    text.includes('no puede finalizarse') ||
    text.includes('no puede seleccionarse') ||
    text.includes('paradas pendientes') ||
    text.includes('estado de visita') ||
    text.includes('debe indicar') ||
    text.includes('obligatori') ||
    text.includes('tipo de soporte') ||
    text.includes('no puede superar') ||
    (text.includes('ruta') &&
      (text.includes('cerrada') || text.includes('completada') || text.includes('cancelada')))
  ) {
    return 'fail';
  }
  return 'retry';
}

export function canRetry(status: OutboxStatus, attempts: number, nextRetryAtMs: number, now = Date.now()) {
  if (status !== 'pending' && status !== 'error') return false;
  if (attempts >= MAX_ATTEMPTS) return false;
  return nextRetryAtMs <= now;
}

export const OUTBOX_MAX_ATTEMPTS = MAX_ATTEMPTS;
