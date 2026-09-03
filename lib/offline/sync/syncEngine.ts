import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import type { Model } from '@nozbe/watermelondb';
import { supabase } from '@/lib/supabase';
import { getDatabase, isDatabaseOpen } from '../database';
import { isNetInfoOnline } from '../network';
import { applyPullPayload, pruneOutOfScopeNegocios } from './applyPull';
import { planOutboxRun } from './lanes';
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
  assertPullIsComplete,
  cursorFromServerTime,
  type CreateCustomerPayload,
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

export async function runSync(reason: SyncReason = 'manual') {
  if (!isDatabaseOpen()) return;
  if (inFlight) return inFlight;
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
      await pullRemote(userId);
      await refreshPendingCount();
      useSyncStore.getState().setStatus('idle');
      useSyncStore.getState().setLastError(null);
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
  });
  return inFlight;
}

async function pullRemote(userId: string) {
  const database = getDatabase();
  const lastPulledAt = await getMeta(database, 'last_pulled_at');
  const { data, error } = await supabase.rpc('pull_mobile_sync', {
    p_last_pulled_at: lastPulledAt,
    p_limit: PULL_LIMIT,
  });
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
  assertPullIsComplete(payload, PULL_LIMIT);
  await applyPullPayload(database, payload, userId);
  await setMeta(database, 'last_pulled_at', cursorFromServerTime(payload.server_time));
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
  await pruneScope(database);
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
  const message =
    result.outcome === 'retry'
      ? `${result.message} (se agotaron los reintentos)`
      : result.message;
  const changes = new PreparedChanges();
  changes.update(item, (record) => {
    record.status = terminal;
    record.attempts = record.attempts + 1;
    record.lastError = message;
  });
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
