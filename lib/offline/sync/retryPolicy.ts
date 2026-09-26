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

/**
 * Textos de una petición que NO llegó al servidor (o cuya respuesta nunca
 * volvió). La lista es estricta a propósito: antes bastaba con que el mensaje
 * del servidor contuviera «fetch», «offline» o «abort» para darlo por red
 * caída, y un rechazo como «Could not find the function
 * create_customer_offline(…)» congelaba toda la cola como si no hubiera señal.
 */
const TRANSPORT_FAILURE_PATTERNS: RegExp[] = [
  // React Native / Hermes: `TypeError: Network request failed`.
  /network request failed/i,
  // Navegadores y polyfills de fetch.
  /failed to fetch/i,
  /networkerror when attempting to fetch/i,
  /^(typeerror: )?load failed$/i,
  // iOS (NSURLErrorDomain) y Android (OkHttp).
  /the internet connection appears to be offline/i,
  /the network connection was lost/i,
  /could not connect to the server/i,
  /unable to resolve host/i,
  /failed to connect to/i,
  /\b(ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENOTFOUND|ENETUNREACH|EAI_AGAIN)\b/,
  /socket hang up/i,
  /(connection|request) timed out/i,
  // Corte propio del cliente de Supabase (`REQUEST_TIMEOUT_MESSAGE`) y de los
  // envoltorios con tiempo límite (`getSession timeout`).
  /no respondi[óo] a tiempo/i,
  /^[a-z_.]+ timeout$/i,
  // `AbortError` de una petición cortada: postgrest lo pinta como
  // «AbortError: Aborted»; otros como «Aborted» o «The operation was aborted».
  /^(aborterror|fetcherror)\b/i,
  /^aborted\.?$/i,
  /^the (operation|user) (was )?aborted/i,
];

export function isNetworkErrorMessage(message: string): boolean {
  const text = String(message || '').trim();
  return TRANSPORT_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

type ErrorShape = { name?: unknown; message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };

function errorShape(error: unknown): ErrorShape {
  if (error && typeof error === 'object') return error as ErrorShape;
  return { message: String(error ?? '') };
}

/** Texto de cualquier error (Error, PostgrestError, texto suelto). */
export function pushErrorText(error: unknown): string {
  const shape = errorShape(error);
  return typeof shape.message === 'string' ? shape.message : String(shape.message ?? '');
}

/**
 * ¿La respuesta vino del servidor? Un código SQLSTATE (`P0001`, `23505`,
 * `42883`…), uno de PostgREST (`PGRST202`) o un estado HTTP prueban que la
 * petición llegó: nunca es falta de señal, diga lo que diga el texto.
 */
function answeredByServer(shape: ErrorShape): boolean {
  const code = typeof shape.code === 'string' ? shape.code.trim() : '';
  // Las clases SQLSTATE nunca empiezan por «E»: así `EPIPE` (errno de socket,
  // también de cinco letras) no pasa por respuesta del servidor.
  if (/^PGRST/i.test(code) || /^(?!E)[0-9A-Z]{5}$/.test(code)) return true;
  const status = Number(shape.status ?? shape.statusCode);
  return Number.isFinite(status) && status >= 100;
}

/**
 * Falta de red REAL: error de transporte (TypeError de fetch, AbortError del
 * tiempo límite, códigos de socket) y nunca una respuesta del servidor.
 */
export function isTransportError(error: unknown): boolean {
  const shape = errorShape(error);
  if (answeredByServer(shape)) return false;
  const name = typeof shape.name === 'string' ? shape.name : '';
  if (name === 'AbortError') return true;
  // supabase-auth: el refresco del token no llegó (sin estado HTTP).
  if (name === 'AuthRetryableFetchError') return true;
  const message = pushErrorText(error);
  if (error instanceof TypeError && /fetch|network/i.test(message)) return true;
  return isNetworkErrorMessage(message);
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
 * Reglas de negocio de `create_negocio` (y sus ayudantes: vendedor = dueño del
 * cliente, plan de cuotas, abonos iniciales, cantidades enteras),
 * `create_customer_offline` y `register_negocio_pago`. Antes caían en «retry»
 * y la cola insistía medio día contra un rechazo que nunca iba a cambiar.
 *
 * Textos de 20261206120000, 20261207120000, 20261214120000 (vendedor dueño),
 * 20260906120000 (abonos y cuotas), 20261021120000 (unidades enteras),
 * 20261210120000 (cliente) y 20261111120000 (pagos).
 */
export function isDefinitiveBusinessError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    // Vendedor = dueño del cliente.
    text.includes('ya tiene vendedor') ||
    text.includes('ya pertenece al vendedor') ||
    text.includes('no tiene vendedor') ||
    text.includes('no se cambia desde el negocio') ||
    text.includes('seleccione ') ||
    text.includes('indique ') ||
    // «El cliente del negocio no existe», «La orden … no existe».
    text.includes('no existe') ||
    text.includes('no pertenece') ||
    text.includes('no coincide') ||
    text.includes('debe tener') ||
    text.includes('debe ser mayor') ||
    text.includes('debe ser un número entero') ||
    text.includes('debe ser un numero entero') ||
    /inv[aá]lid[oa]s?\b/.test(text) ||
    text.includes('invalid input syntax') ||
    text.includes('no puede ser anterior') ||
    text.includes('no puede ser negativa') ||
    text.includes('no puede haber') ||
    text.includes('no pueden superar') ||
    text.includes('formato válido') ||
    text.includes('formato valido') ||
    text.includes('no lleva cuotas') ||
    text.includes('configuración de crédito') ||
    text.includes('configuracion de credito') ||
    text.includes('valores inconsistentes') ||
    text.includes('ya no puede editarse') ||
    text.includes('solo el administrador')
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
  if (isNetworkErrorMessage(message)) return 'network';
  return classifyServerMessage(message);
}

/**
 * Igual que `classifyPushError`, pero mirando el error completo: si trae
 * código SQLSTATE/PostgREST o estado HTTP, lo contestó el servidor y nunca se
 * toma como falta de señal.
 */
export function classifyPushFailure(error: unknown): RetryDecision {
  if (isTransportError(error)) return 'network';
  return classifyServerMessage(pushErrorText(error));
}

function classifyServerMessage(message: string): RetryDecision {
  const text = message.toLowerCase();
  if (
    text.includes('duplicado') ||
    text.includes('id_number') ||
    text.includes('ya existe') ||
    text.includes('clave de idempotencia ya fue usada')
  ) {
    return 'conflict';
  }
  if (isDefinitiveOriginError(text)) return 'fail';
  if (isDefinitiveBusinessError(text)) return 'fail';
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
