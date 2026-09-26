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
  purgeUnselectedDomains,
  purgeUnsentNegocios,
  wipeLocalCatalog,
} from './applyPull';
import { applyOrdersSnapshot } from './ordersSnapshot';
import { requestPull } from './pullRequest';
import {
  choicesChangedSinceDownload,
  fullDomainsSent,
  manualFullDomains,
  markManualDownloadDone,
  markSelectiveSupport,
  parseSyncConfig,
  readSelectiveSupport,
  readSyncConfig,
  shouldSendSelectiveOptions,
  storeSyncConfigFromPayload,
} from './syncPrefs';
import {
  cursorForCatalogPull,
  forgetCatalogPull,
  getCatalogCursor,
  isDownloadReason,
  markCatalogPulled,
  mustRerunAfterInFlight,
  shouldIncludeCatalog,
  type InFlightSyncMeta,
} from './catalogPull';
import { planOutboxRun } from './lanes';
import {
  prepareConfirmNegocio,
  prepareRejectDependentNegocios,
  prepareRejectedNegocio,
  prepareRelinkNegocioCustomer,
  type ConfirmedNegocio,
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
import { EXHAUSTED_RETRIES_PREFIX } from './syncErrorText';
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
    useSyncStore.getState().setNoticeCount(0);
    return;
  }
  const counts = await countOutbox(getDatabase());
  useSyncStore.getState().setPendingCount(counts.pending);
  useSyncStore.getState().setFailedCount(counts.failed);
  useSyncStore.getState().setNoticeCount(counts.notices);
}

export async function runSync(reason: SyncReason = 'manual'): Promise<void> {
  if (!isDatabaseOpen()) return;
  if (inFlight) {
    if (inFlightMeta && mustRerunAfterInFlight({ inFlight: inFlightMeta, reason })) {
      // Se espera a que termine la que corre y se lanza la propia; si varias
      // esperan, la primera arranca y las demás se suman a ella.
      const current = inFlight;
      return current.then((): Promise<void> => runSync(reason));
    }
    return inFlight;
  }
  // Descarga selectiva v2: sólo «Descargar» (reason 'manual') baja datos. Las
  // automáticas (al abrir la app, al volver la señal, tras un cobro, el
  // reintento) únicamente SUBEN la cola: nada llega al teléfono sin que la
  // persona lo pida.
  inFlightMeta = { reason };
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
      if (push.contacted) await setLastOnlineVerifiedAt();
      if (!isDownloadReason(reason)) {
        await refreshPendingCount();
        useSyncStore.getState().setStatus('idle');
        useSyncStore.getState().setLastError(null);
        return;
      }
      const truncationWarning = await pullRemote(userId, reason);
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
        useSyncStore.getState().setNoticeCount(0);
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

/** Descarga manual. Devuelve el aviso de descarga recortada, o `null` si vino completa. */
async function pullRemote(userId: string, reason: SyncReason = 'manual'): Promise<string | null> {
  const database = getDatabase();
  const lastPulledAt = pullCursorForPayloadVersion(
    await getMeta(database, 'last_pulled_at'),
    await getMeta(database, PULL_PAYLOAD_VERSION_META_KEY)
  );
  // El catálogo viaja en toda descarga manual salvo al recaudador puro o con
  // productos en «ninguno» (ver `catalogPull.ts`). Cuando viaja se pide desde
  // SU cursor, que es más viejo que el general: con el cursor general el
  // servidor contestaría «sin novedades» y el teléfono se quedaría sin
  // catálogo. Lo que se repite del resto del paquete son upserts idempotentes.
  const storedScope = await getMeta(database, PULL_SCOPE_META_KEY);
  const selectiveSupport = await readSelectiveSupport(database);
  const sendOptions = shouldSendSelectiveOptions({
    supported: selectiveSupport.supported,
    checkedAt: selectiveSupport.checkedAt,
  });
  const syncConfig = await readSyncConfig(database);
  const includeCatalog = shouldIncludeCatalog({
    reason,
    scope: storedScope,
    productsMode: syncConfig?.productos.mode ?? null,
    choicesChanged: await choicesChangedSinceDownload(database),
  });
  const catalogCursor = includeCatalog
    ? cursorForCatalogPull(lastPulledAt, await getCatalogCursor(database))
    : null;
  const request = await requestPull(
    (fn, args) => supabase.rpc(fn, args as never) as never,
    {
      lastPulledAt,
      catalogCursor,
      includeCatalog,
      limit: PULL_LIMIT,
      // Toda descarga manual pide completos los dominios seleccionables: el
      // teléfono queda sólo con lo elegido.
      options: sendOptions ? { full_domains: manualFullDomains(), orders: true } : null,
    }
  );
  if (request.error) throw request.error;
  // La pantalla de preferencias sólo se muestra si el servidor la entiende.
  if (request.selective === 'supported' && selectiveSupport.supported !== 'true') {
    await markSelectiveSupport(database, true);
  }
  if (request.selective === 'unsupported') await markSelectiveSupport(database, false);
  const payload = request.data as PullPayload;
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
  // Productos en «ninguno»: fuera el catálogo del teléfono (salvo lo de
  // negocios sin confirmar) y se olvida su cursor para bajarlo entero si
  // vuelve a «todo».
  const receivedConfig = parseSyncConfig(payload.sync_config);
  const productsNone = receivedConfig?.productos.mode === 'ninguno';
  const catalogApplied = productsNone ? false : await applyCatalogPayload(database, payload);
  if (productsNone) {
    await wipeLocalCatalog(database);
    await forgetCatalogPull(database);
  } else if (catalogApplied) {
    await markCatalogPulled(database, payload.server_time);
  }
  // Foto de órdenes llevadas y remisiones pendientes: reemplazo completo.
  await applyOrdersSnapshot(database, payload);
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
    // Negocios, cuotas, pagos e ítems: si el servidor los mandó completos se
    // borra lo que no vino; si no, la poda por `pull_mobile_scope` de siempre.
    if (!(await purgeUnsentNegocios(database, payload))) await pruneScope(database);
    // Recaudador puro sin descarga selectiva: fuera los clientes que no son
    // de ningún negocio suyo (20261128120000). Con clientes completos ya
    // vienen sólo los de sus negocios abiertos (v3) y los purga la descarga
    // selectiva.
    if (payload.pull_scope === 'cobro' && !fullDomainsSent(payload).includes('clientes')) {
      await pruneCustomersOutsideNegocios(database);
    }
    // Descarga selectiva: fuera lo que ya no se lleva, sólo en los dominios
    // que vinieron completos. Después de la poda de negocios, ya al día.
    await purgeUnselectedDomains(database, payload, { catalogApplied });
  }
  // Preferencias y revisiones aplicadas. La revisión de un dominio sólo se da
  // por aplicada si vino completo y sin recortar: si no, se vuelve a pedir.
  await storeSyncConfigFromPayload(database, payload, { catalogApplied, catalogWiped: productsNone });
  await markManualDownloadDone(database);
  return truncationWarning;
}

/** Elimina negocios que ya no están en el alcance del usuario. Opcional: si el
 * backend aún no expone `pull_mobile_scope`, se omite sin fallar. */
async function pruneScope(database: ReturnType<typeof getDatabase>) {
  const { data, error } = await supabase.rpc('pull_mobile_scope', { p_limit: PULL_LIMIT });
  if (error || !Array.isArray(data)) return;
  await pruneOutOfScopeNegocios(database, data.map((id) => String(id)));
}

/** `contacted`: al menos un comando llegó al servidor y obtuvo respuesta. */
type PushSummary = { networkDown: boolean; nextDueAt: number | null; contacted: boolean };

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
  let contacted = false;

  for (const entry of plan.runnable) {
    if (blocked.has(entry.lane)) continue;
    const item = entry.item;
    await database.write(async () => markOutboxSyncing(item));
    const result = await pushOutboxItem(item);

    if (result.outcome === 'network') {
      await database.write(async () => markOutboxNetworkRetry(item, result.message, Date.now()));
      return { networkDown: true, nextDueAt: Date.now() + NETWORK_RETRY_DELAY_MS, contacted };
    }
    contacted = true;

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

  return { networkDown: false, nextDueAt, contacted };
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
      await prepareConfirmNegocio(
        database,
        payload as unknown as CreateNegocioPayload,
        changes,
        (result.result || {}) as ConfirmedNegocio
      );
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
      ? `${EXHAUSTED_RETRIES_PREFIX}${result.message}`
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
  // Cliente creado sin señal que no llegó: los negocios que lo usan quedan
  // rechazados ya, con el motivo, en vez de enviarse y fallar medio día.
  if (item.type === 'create_customer') {
    await prepareRejectDependentNegocios(
      database,
      payload as unknown as CreateCustomerPayload,
      terminal,
      message,
      changes
    );
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
