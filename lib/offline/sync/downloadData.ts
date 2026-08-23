import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useSyncStore } from '../store/syncStore';
import { runSync } from './syncEngine';

export function isNetInfoOnline(state: NetInfoState | null) {
  if (!state) return false;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export type ManualDownloadResult =
  | { ok: true }
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'error'; message: string };

export async function requestManualDownload(): Promise<ManualDownloadResult> {
  const net = await NetInfo.fetch();
  const online = isNetInfoOnline(net);
  useSyncStore.getState().setOnline(online);
  if (!online) {
    useSyncStore.getState().setStatus('offline');
    return { ok: false, reason: 'offline' };
  }
  await runSync('manual');
  const lastError = useSyncStore.getState().lastError;
  if (lastError) {
    return { ok: false, reason: 'error', message: lastError };
  }
  return { ok: true };
}

export function formatLastDownloadTime(lastSyncedAt: number | null) {
  if (!lastSyncedAt) return null;
  return new Date(lastSyncedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatLocalDataLabel(lastSyncedAt: number | null) {
  const time = formatLastDownloadTime(lastSyncedAt);
  return time ? `Datos locales · última descarga ${time}` : 'Datos locales';
}
