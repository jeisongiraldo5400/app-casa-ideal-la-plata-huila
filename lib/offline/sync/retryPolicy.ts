export type OutboxStatus = 'pending' | 'syncing' | 'error' | 'conflict' | 'done';

export type RetryDecision = 'retry' | 'fail' | 'conflict';

const MAX_ATTEMPTS = 8;
const BACKOFF_MS = [1000, 4000, 15000, 60000, 120000, 300000, 300000, 300000];

export function nextRetryAt(attempts: number, now = Date.now()): number {
  const index = Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1);
  return now + BACKOFF_MS[index];
}

export function classifyPushError(message: string): RetryDecision {
  const text = message.toLowerCase();
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
    text.includes('ruta') && (text.includes('cerrada') || text.includes('completada') || text.includes('cancelada')) ||
    text.includes('no válido') ||
    text.includes('no valido') ||
    text.includes('monto debe ser mayor')
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
