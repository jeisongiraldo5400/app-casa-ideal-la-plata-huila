import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import type { Model } from '@nozbe/watermelondb';
import { supabase } from '@/lib/supabase';
import { getDatabase, isDatabaseOpen } from '../database';
import { isNetInfoOnline } from '../network';
import {
  applyCatalogPayload,
  applyPullPayload,
  pruneCustomersOutsideNegocios,
  pruneOutOfScopeNegocios,
} from './applyPull';
import {
  clearCatalogRequest,
  cursorForCatalogPull,
  getCatalogCursor,
  getCatalogPulledAt,
  isCatalogRequested,
  markCatalogPulled,
  mustRerunAfterInFlight,
  shouldIncludeCatalog,
  type InFlightSyncMeta,
} from './catalogPull';
import { planOutboxRun } from './lanes';
import {
  prepareConfirmNegocio,
  prepareRejectedNegocio,
  prepareRelinkNegocioCustomer,
} from './negocioCreateCommand';
import {
  countOutbox,
  getMeta,
  listActiveOutbox,
  markOutboxNetworkRetry,
  markOutboxRetry,
  markOutboxSyncing,
  outboxLane,
  parseOutboxPayload,
  recoverInterruptedOutbox,
  setMeta,
} from './outbox';
import { pushOutboxItem, type PushResult } from './pushCommands';
import {
  PreparedChanges,
  prepareAdoptExistingCustomer,
  prepareReconcileRegisteredPago,
  prepareReleaseSnapshot,
  prepareRevertCommand,
} from './reconcile';
import { NETWORK_RETRY_DELAY_MS, OUTBOX_MAX_ATTEMPTS, type OutboxStatus } from './retryPolicy';
import {
  pullTruncationWarning,
  cursorFromServerTime,
  pullCursorForPayloadVersion,
  pullScopeChanged,
  PULL_PAYLOAD_VERSION,
  PULL_PAYLOAD_VERSION_META_KEY,
  PULL_SCOPE_CHANGED_MARKER,
  PULL_SCOPE_META_KEY,
  type CreateCustomerPayload,
  type CreateNegocioPayload,
  type OutboxPayloadBase,
  type PullPayload,
  type RegisterPagoPayload,
} from './types';
import { useSyncStore } from '../store/syncStore';
import { wipeLocalOfflineData } from '../security/wipe';
import { setCachedProfileName, setCachedRoles, setLastOnlineVerifiedAt } from '../security/secureKeys';
import type { SyncOutboxItem } from '../models';

const PULL_LIMIT = 2000;

export type SyncReason = 'manual' | 'reconnect' | 'foreground' | 'mutation' | 'retry';

let started = false;
let inFlight: Promise<void> | null = null;
let inFlightMeta: InFlightSyncMeta | null = null;
let unsubscribeNet: (() => void) | null = null;
let appStateSub: { remove: () => void } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function clearRetryTimer() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/**
 * El outbox solo se procesa cuando algo dispara `runSync`. Tras un fallo con
 * backoff se agenda un intento para no depender de que el usuario vuelva a
 * abrir la app o cambie de red.
 */
function scheduleRetry(dueAt: number | null) {
  clearRetryTimer();
  if (!started || dueAt == null) return;
  const delay = Math.max(dueAt - Date.now(), 1000);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runSync('retry');
  }, delay);
}

export async function refreshPendingCount() {
  if (!isDatabaseOpen()) {
    useSyncStore.getState().setPendingCount(0);
    useSyncStore.getState().setFailedCount(0);
    return;
  }
  const counts = await countOutbox(getDatabase());
  useSyncStore.getState().setPendingCount(counts.pending);
  useSyncStore.getState().setFailedCount(counts.failed);
}

export async function runSync(reason: SyncReason = 'manual'): Promise<void> {
  if (!isDatabaseOpen()) return;
  if (inFlight) {
    const catalogRequested = isCatalogRequested();
    if (
      inFlightMeta &&
      mustRerunAfterInFlight({ inFlight: inFlightMeta, reason, catalogRequested })
    ) {
      // Se espera a que termine la que corre y se lanza la propia; si varias
      // esperan, la primera arranca y las demás se suman a ella.
      const current = inFlight;
      return current.then((): Promise<void> => runSync(reason));
    }
    return inFlight;
  }
  // La petición de catálogo se toma AL ARRANCAR: si llega a mitad de camino,
  // ésta ya no la atiende y no debe borrarla.
  const catalogRequested = isCatalogRequested();
  inFlightMeta = { reason, catalogRequested };
  inFlight = (async () => {
    const net = await NetInfo.fetch();
    const online = isNetInfoOnline(net);
    useSyncStore.getState().setOnline(online);
    if (!online) {
      useSyncStore.getState().setStatus('offline');
      await refreshPendingCount();
      return;
    }
    const { userId } = useSyncStore.getState();
    if (!userId) return;
    useSyncStore.getState().setStatus('syncing');
    let nextDueAt: number | null = null;
    try {
      await recoverInterruptedOutbox(getDatabase());
      const push = await pushDueOutbox();
      nextDueAt = push.nextDueAt;
      if (push.networkDown) {
        // NetInfo dice que hay red pero el servidor no responde: tratar como
        // sin conexión y volver a probar en breve sin consumir intentos.
        useSyncStore.getState().setOnline(false);
        useSyncStore.getState().setStatus('offline');
        useSyncStore.getState().setLastError(null);
        await refreshPendingCount();
        nextDueAt = Date.now() + NETWORK_RETRY_DELAY_MS;
        return;
      }
      const truncationWarning = await pullRemote(userId, reason, catalogRequested);
      await refreshPendingCount();
      useSyncStore.getState().setStatus('idle');
      // El aviso de descarga recortada viaja por `lastError`: la franja de
      // estado ya lo pinta y la descarga manual lo devuelve al usuario.
      useSyncStore.getState().setLastError(truncationWarning);
      useSyncStore.getState().setLastSyncedAt(Date.now());
    } catch (error: any) {
      await refreshPendingCount().catch(() => undefined);
      if (!useSyncStore.getState().userId) {
        useSyncStore.getState().setStatus('idle');
        useSyncStore.getState().setPendingCount(0);
        useSyncStore.getState().setFailedCount(0);
        useSyncStore.getState().setLastError(null);
        return;
      }
      useSyncStore.getState().setStatus('error');
      useSyncStore.getState().setLastError(error?.message || 'No se pudo sincronizar');
    } finally {
      scheduleRetry(nextDueAt);
    }
  })().finally(() => {
    inFlight = null;
    inFlightMeta = null;
  });
  return inFlight;
}

/**
 * ¿El servidor no conoce `p_include_catalog`? PostgREST resuelve la función por
 * los nombres de sus argumentos: con un servidor sin la migración del catálogo
 * la llamada falla con PGRST202 en vez de ignorar el parámetro.
 */
function isMissingCatalogParamError(error: unknown): boolean {
  const record = (error || {}) as { code?: unknown; message?: unknown };
  if (String(record.code || '') === 'PGRST202') return true;
  return /p_include_catalog|could not find the function|does not exist/i.test(
    String(record.message || '')
  );
}

/** Devuelve el aviso de descarga recortada, o `null` si vino completa. */
async function pullRemote(
  userId: string,
  reason: SyncReason = 'manual',
  catalogRequested = false
): Promise<string | null> {
  const database = getDatabase();
  const lastPulledAt = pullCursorForPayloadVersion(
    await getMeta(database, 'last_pulled_at'),
    await getMeta(database, PULL_PAYLOAD_VERSION_META_KEY)
  );
  // El catálogo de producto sólo viaja si hace falta (ver `catalogPull.ts`).
  // Cuando viaja se pide desde SU cursor, que es más viejo que el general: con
  // el cursor general el servidor contestaría «sin novedades» y el teléfono se
  // quedaría sin catálogo para siempre. Lo que se repite del resto del paquete
  // son upserts idempotentes de, como mucho, un día.
  //
  // Al recaudador puro (alcance 'cobro') el servidor nunca le manda catálogo:
  // pedirlo sólo haría que cada «Descargar información» bajara todo desde cero,
  // porque su cursor de catálogo nunca avanza.
  const storedScope = await getMeta(database, PULL_SCOPE_META_KEY);
  const includeCatalog =
    storedScope !== 'cobro' &&
    shouldIncludeCatalog({
      reason,
      requested: catalogRequested,
      lastCatalogAt: await getCatalogPulledAt(database),
    });
  const catalogCursor = includeCatalog
    ? cursorForCatalogPull(lastPulledAt, await getCatalogCursor(database))
    : null;
  let { data, error } = await supabase.rpc('pull_mobile_sync', {
    p_last_pulled_at: includeCatalog ? catalogCursor : lastPulledAt,
    p_limit: PULL_LIMIT,
    ...(includeCatalog ? { p_include_catalog: true } : {}),
  });
  if (error && includeCatalog && isMissingCatalogParamError(error)) {
    // Servidor anterior a 20261122120000: no conoce el tercer parámetro. Se
    // sincroniza sin catálogo en vez de dejar el teléfono sin descargar nada.
    ({ data, error } = await supabase.rpc('pull_mobile_sync', {
      p_last_pulled_at: lastPulledAt,
      p_limit: PULL_LIMIT,
    }));
  }
  if (error) throw error;
  const payload = data as PullPayload;
  if (payload.must_wipe) {
    await wipeLocalOfflineData();
    useSyncStore.getState().setUserId(null);
    await supabase.auth.signOut({ scope: 'local' });
    const { useAuthStore } = await import('@/components/auth/infrastructure/store/authStore');
    useAuthStore.getState().clearLocalAuth();
    throw new Error('Este dispositivo debe volver a iniciar sesión');
  }
  // Un paquete recortado ya no se descarta: se guarda lo que llegó y el aviso
  // sube a la franja de estado (antes el teléfono se quedaba sin nada).
  const truncationWarning = pullTruncationWarning(payload, PULL_LIMIT);
  await applyPullPayload(database, payload, userId);
  // El catálogo sólo avanza su cursor si de verdad vino en el paquete.
  if (await applyCatalogPayload(database, payload)) {
    await markCatalogPulled(database, payload.server_time);
  }
  // Sólo se borra la petición que esta descarga atendió.
  if (catalogRequested) clearCatalogRequest();
  await setMeta(database, 'last_pulled_at', cursorFromServerTime(payload.server_time));
  // Si el alcance cambió (le dieron o le quitaron un rol), la próxima descarga
  // es completa: el cursor delta no traería los clientes viejos que ahora sí le
  // tocan. Se consigue guardando una versión de paquete que no existe.
  const scopeChanged = pullScopeChanged(storedScope, payload.pull_scope);
  await setMeta(
    database,
    PULL_PAYLOAD_VERSION_META_KEY,
    scopeChanged ? PULL_SCOPE_CHANGED_MARKER : PULL_PAYLOAD_VERSION
  );
  if (payload.pull_scope) await setMeta(database, PULL_SCOPE_META_KEY, payload.pull_scope);
  await setLastOnlineVerifiedAt();
  if (payload.profile_name !== undefined) await setCachedProfileName(payload.profile_name);
  await setCachedRoles({
    userId,
    roles: (payload.roles || []).map((role) => ({
      id: role.id,
      role_id: role.role_id,
      role: { id: role.role_id, nombre: role.nombre },
    })),
  });
  // Con la descarga recortada la lista de alcance también viene recortada: no
  // es autoridad para borrar, así que la poda se salta hasta la próxima
  // descarga completa.
  if (!truncationWarning) {
    await pruneScope(database);
    // Recaudador puro: fuera los clientes que no son de ningún negocio suyo
    // (20261128120000). Va después de la poda de negocios, ya al día.
    if (payload.pull_scope === 'cobro') await pruneCustomersOutsideNegocios(database);
  }
  return truncationWarning;
}

/** Elimina negocios que ya no están en el alcance del usuario. Opcional: si el
 * backend aún no expone `pull_mobile_scope`, se omite sin fallar. */
async function pruneScope(database: ReturnType<typeof getDatabase>) {
  const { data, error } = await supabase.rpc('pull_mobile_scope', { p_limit: PULL_LIMIT });
  if (error || !Array.isArray(data)) return;
  await pruneOutOfScopeNegocios(database, data.map((id) => String(id)));
}

type PushSummary = { networkDown: boolean; nextDueAt: number | null };

async function pushDueOutbox(): Promise<PushSummary> {
  const database = getDatabase();
  const now = Date.now();
  const active = await listActiveOutbox(database);
  const plan = planOutboxRun(
    active.map((item) => ({
      id: item.id,
      lane: outboxLane(item),
      status: item.status as OutboxStatus,
      attempts: item.attempts,
      nextRetryAt: item.nextRetryAt,
      queuedAt: item.queuedAt,
      item,
    })),
    now
  );
  const blocked = new Set(plan.blockedLanes);
  let nextDueAt = plan.nextDueAt;

  for (const entry of plan.runnable) {
    if (blocked.has(entry.lane)) continue;
    const item = entry.item;
    await database.write(async () => markOutboxSyncing(item));
    const result = await pushOutboxItem(item);

    if (result.outcome === 'network') {
      await database.write(async () => markOutboxNetworkRetry(item, result.message, Date.now()));
      return { networkDown: true, nextDueAt: Date.now() + NETWORK_RETRY_DELAY_MS };
    }

    await database.write(async () => {
      const operations = await settleOutboxItem(database, item, result);
      if (operations.length) await database.batch(...operations);
    });

    if (result.outcome !== 'done') {
      blocked.add(entry.lane);
      if (result.outcome === 'retry') {
        const dueAt = item.nextRetryAt;
        if (nextDueAt === null || dueAt < nextDueAt) nextDueAt = dueAt;
      }
    }
  }

  return { networkDown: false, nextDueAt };
}

/** Traduce el resultado del servidor a cambios locales (outbox + filas optimistas). */
async function settleOutboxItem(
  database: ReturnType<typeof getDatabase>,
  item: SyncOutboxItem,
  result: PushResult
): Promise<Model[]> {
  const payload = parseOutboxPayload<OutboxPayloadBase & Record<string, unknown>>(item);

  if (result.outcome === 'done') {
    const changes = new PreparedChanges();
    if (item.type === 'register_pago' || item.type === 'register_route_pago') {
      const pagoId = (result.result as { pagoId?: string } | undefined)?.pagoId;
      if (pagoId) {
        await prepareReconcileRegisteredPago(database, payload as RegisterPagoPayload, pagoId, changes);
      }
    }
    if (item.type === 'create_customer' && result.adoptExisting) {
      await prepareAdoptExistingCustomer(database, payload as CreateCustomerPayload, result.adoptExisting, changes);
      // El cliente provisional desaparece: los negocios que siguen en cola
      // apuntaban a ese id y se quedarían sin cliente al llegar al servidor.
      await prepareRelinkNegocioCustomer(
        database,
        (payload as CreateCustomerPayload).customerId,
        result.adoptExisting.id,
        changes
      );
    }
    if (item.type === 'create_negocio') {
      await prepareConfirmNegocio(database, payload as unknown as CreateNegocioPayload, changes);
    }
    await prepareReleaseSnapshot(database, payload.snapshot, changes);
    changes.update(item, (record) => {
      record.status = 'done';
      record.lastError = result.note ?? null;
      record.resultJson = result.result ? JSON.stringify(result.result) : record.resultJson;
    });
    return changes.build();
  }

  if (result.outcome === 'retry' && item.attempts + 1 < OUTBOX_MAX_ATTEMPTS) {
    await markOutboxRetry(item, result.message);
    return [];
  }

  const terminal: 'failed' | 'conflict' = result.outcome === 'conflict' ? 'conflict' : 'failed';
  // Se distingue lo que el servidor rechazó por una regla (no cambiará al
  // reintentar) de lo que no se pudo enviar tras insistir mucho rato: el
  // segundo caso puede volver a intentarse desde la cola.
  const message =
    result.outcome === 'retry'
      ? `No se pudo enviar al servidor después de varios intentos: ${result.message}`
      : result.message;
  const changes = new PreparedChanges();
  changes.update(item, (record) => {
    record.status = terminal;
    record.attempts = record.attempts + 1;
    record.lastError = message;
  });
  // El negocio rechazado no se borra del teléfono: queda con su motivo, igual
  // que un pago rechazado, porque el cliente ya firmó el contrato.
  if (item.type === 'create_negocio') {
    await prepareRejectedNegocio(database, payload as unknown as CreateNegocioPayload, message, changes);
  }
  return prepareRevertCommand(database, item, message, changes);
}

export function startSyncListeners() {
  if (started) return;
  started = true;
  unsubscribeNet = NetInfo.addEventListener((state) => {
    const online = isNetInfoOnline(state);
    useSyncStore.getState().setOnline(online);
    if (online) void runSync('reconnect');
    else useSyncStore.getState().setStatus('offline');
  });
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void runSync('foreground');
  });
  void NetInfo.fetch().then((state) => useSyncStore.getState().setOnline(isNetInfoOnline(state)));
}

export function stopSyncListeners() {
  unsubscribeNet?.();
  unsubscribeNet = null;
  appStateSub?.remove();
  appStateSub = null;
  clearRetryTimer();
  started = false;
}
