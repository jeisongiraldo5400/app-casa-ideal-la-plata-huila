import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getDatabase, isDatabaseOpen } from '../database';
import { applyPullPayload } from './applyPull';
import {
  countPendingOutbox,
  getMeta,
  listDueOutbox,
  markOutboxDone,
  markOutboxRetry,
  markOutboxSyncing,
  markOutboxTerminal,
  setMeta,
} from './outbox';
import { pushOutboxItem } from './pushCommands';
import { canRetry, OUTBOX_MAX_ATTEMPTS } from './retryPolicy';
import type { PullPayload } from './types';
import { useSyncStore } from '../store/syncStore';
import { wipeLocalOfflineData } from '../security/wipe';
import { setCachedRoles, setLastOnlineVerifiedAt } from '../security/secureKeys';
import { FileUpload, NegocioPago } from '../models';

let started = false;
let inFlight: Promise<void> | null = null;
let unsubscribeNet: (() => void) | null = null;
let appStateSub: { remove: () => void } | null = null;

function isOnline(state: NetInfoState | null) {
  if (!state) return false;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

async function refreshPendingCount() {
  if (!isDatabaseOpen()) {
    useSyncStore.getState().setPendingCount(0);
    return;
  }
  const count = await countPendingOutbox(getDatabase());
  useSyncStore.getState().setPendingCount(count);
}

export async function runSync(reason: 'manual' | 'reconnect' | 'foreground' | 'mutation' = 'manual') {
  if (!isDatabaseOpen()) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const net = await NetInfo.fetch();
    useSyncStore.getState().setOnline(isOnline(net));
    if (!isOnline(net)) {
      useSyncStore.getState().setStatus('offline');
      await refreshPendingCount();
      return;
    }
    const { userId } = useSyncStore.getState();
    if (!userId) return;
    useSyncStore.getState().setStatus('syncing');
    try {
      await pushDueOutbox();
      await pullRemote(userId);
      await refreshPendingCount();
      useSyncStore.getState().setStatus('idle');
      useSyncStore.getState().setLastError(null);
      useSyncStore.getState().setLastSyncedAt(Date.now());
    } catch (error: any) {
      useSyncStore.getState().setStatus('error');
      useSyncStore.getState().setLastError(error?.message || 'No se pudo sincronizar');
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
    p_limit: 500,
  });
  if (error) throw error;
  const payload = data as PullPayload;
  if (payload.must_wipe) {
    await wipeLocalOfflineData();
    throw new Error('Este dispositivo debe volver a iniciar sesión');
  }
  await applyPullPayload(database, payload, userId);
  await setMeta(database, 'last_pulled_at', payload.server_time);
  await setLastOnlineVerifiedAt();
  if (payload.roles?.length) {
    await setCachedRoles({
      userId,
      roles: payload.roles.map((role) => ({
        id: role.id,
        role_id: role.role_id,
        role: { id: role.role_id, nombre: role.nombre },
      })),
    });
  }
}

async function pushDueOutbox() {
  const database = getDatabase();
  const due = await listDueOutbox(database);
  for (const item of due) {
    if (!canRetry(item.status as 'pending' | 'error', item.attempts, item.nextRetryAt) && item.status !== 'pending') {
      continue;
    }
    await database.write(async () => markOutboxSyncing(item));
    const result = await pushOutboxItem(item);
    await database.write(async () => {
      if (result.outcome === 'done') {
        await markOutboxDone(item, result.result);
        if (item.type === 'register_pago' || item.type === 'register_route_pago') {
          const payload = JSON.parse(item.payloadJson) as { pagoLocalId?: string };
          const pagoId = (result.result as { pagoId?: string } | undefined)?.pagoId;
          if (payload.pagoLocalId && pagoId) {
            try {
              const pago = await database.get<NegocioPago>('negocio_pagos').find(payload.pagoLocalId);
              await pago.update((record) => {
                record.rowSyncStatus = 'synced';
              });
            } catch {
              // Local optimistic row may already have been replaced by pull.
            }
            const uploads = await database.get<FileUpload>('file_uploads').query().fetch();
            for (const upload of uploads) {
              if (upload.pagoLocalId === payload.pagoLocalId) {
                await upload.update((record) => {
                  record.pagoServerId = pagoId;
                });
              }
            }
          }
        }
      } else if (result.outcome === 'retry' && item.attempts + 1 < OUTBOX_MAX_ATTEMPTS) {
        await markOutboxRetry(item, result.message);
      } else if (result.outcome === 'conflict') {
        await markOutboxTerminal(item, 'conflict', result.message);
      } else {
        await markOutboxTerminal(item, 'error', result.message);
      }
    });
  }
}

export function startSyncListeners() {
  if (started) return;
  started = true;
  unsubscribeNet = NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    useSyncStore.getState().setOnline(online);
    if (online) void runSync('reconnect');
    else useSyncStore.getState().setStatus('offline');
  });
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void runSync('foreground');
  });
  void NetInfo.fetch().then((state) => useSyncStore.getState().setOnline(isOnline(state)));
}

export function stopSyncListeners() {
  unsubscribeNet?.();
  unsubscribeNet = null;
  appStateSub?.remove();
  appStateSub = null;
  started = false;
}
