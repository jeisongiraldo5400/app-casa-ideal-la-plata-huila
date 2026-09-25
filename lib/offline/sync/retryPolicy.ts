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

/**
 * Un error transitorio (servidor caído un rato, 502 de un proxy) no puede
 * volverse terminal en unos minutos: al agotarse los intentos el cobro se da
 * por no enviado y el cliente ya se llevó el recibo impreso. Con 20 intentos y
 * el último escalón de una hora, la cola insiste algo más de medio día antes de
 * pedir ayuda a la persona.
 */
const MAX_ATTEMPTS = 20;
const BACKOFF_MS = [
  1000, 4000, 15000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000,
];
/** Espera antes de volver a probar tras un fallo de red (no consume intentos). */
export const NETWORK_RETRY_DELAY_MS = 15000;

export const RETRYABLE_STATUSES: OutboxStatus[] = ['pending', 'error'];
export const TERMINAL_STATUSES: OutboxStatus[] = ['failed', 'conflict'];

export function nextRetryAt(attempts: number, now = Date.now()): number {
  const index = Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1);
  return now + BACKOFF_MS[index];
}

export function isNetworkErrorMessage(message: string): boolean {
  // `abort` y «no respondió a tiempo»: petición cortada por el tiempo límite
  // del cliente de Supabase; no llegó al servidor.
  return /network|fetch|failed to connect|internet|offline|timeout|timed out|socket|econn|load failed|abort|no respondi[óo] a tiempo/i.test(
    message
  );
}

/**
 * Rechazos definitivos del ORIGEN de un negocio creado sin señal: la orden de
 * entrega o la remisión de la que sale (o a la que va) cambió mientras el
 * teléfono estaba sin red. Reintentar no lo arregla; antes caían en «retry» y
 * la cola insistía medio día antes de avisar. Ahora el negocio queda rechazado
 * con el motivo del servidor («No se pudo enviar»).
 *
 * Textos de `create_negocio` / `activate_negocio` (20261013120000,
 * 20261028120000) y de la foto de órdenes (20261130*).
 */
export function isDefinitiveOriginError(message: string): boolean {
  const text = message.toLowerCase();
  const aboutOrder = /orden|remisi[oó]n|\boe\b/.test(text);
  return (
    (aboutOrder && text.includes('cancelada')) ||
    (aboutOrder && /no existe/.test(text)) ||
    /ya est[aá] vinculada/.test(text) ||
    // Otro negocio ya tomó la misma OE de cliente (índice único de
    // 20260813200000): pasa cuando dos teléfonos sin señal venden la misma.
    text.includes('idx_negocios_unique_customer_source_oe') ||
    /ya la tom[oó] un negocio/.test(text) ||
    /solo se puede enviar el negocio en una remisi[oó]n pendiente/.test(text) ||
    /no puede adem[aá]s enviarse en una remisi[oó]n/.test(text) ||
    text.includes('debe coincidir con el de la orden') ||
    /no es v[aá]lid[oa] como origen/.test(text) ||
    // Falta de disponible en la orden o remisión de origen.
    text.includes('no cuenta con suficiente') ||
    text.includes('insuficiente') ||
    /no est[aá] presente en la (orden|remisi[oó]n)/.test(text) ||
    /(sin|no hay|ya no (hay|tiene|queda)) (saldo |cantidad )?disponible/.test(text)
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
  if (isDefinitiveOriginError(text)) return 'fail';
  if (
    text.includes('saldo') ||
    text.includes('sin permiso') ||
    // «Solo un administrador puede aprobar la orden de compra …» (20261028140000).
    text.includes('solo un administrador') ||
    // «… está aprobada: la devolución no se puede revertir …» (20261028140000).
    text.includes('no se puede revertir') ||
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
    // Pago sin método (servidor desde 20261018130000): reintentar nunca lo resolverá.
    text.includes('método de pago') ||
    text.includes('metodo de pago') ||
    text.includes('tipo de soporte') ||
    // Salida sin orden de entrega de un no admin (servidor desde 20261028130000).
    text.includes('solo las registra un administrador') ||
    // Negocio ya activado (servidor desde 20261029130000): hoy no hay comandos
    // offline que editen negocios; si se agregan, este rechazo es definitivo.
    text.includes('solo se pueden editar la dirección') ||
    text.includes('no se puede editar') ||
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
