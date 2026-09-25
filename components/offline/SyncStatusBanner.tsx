import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { runSync } from '@/lib/offline/sync/syncEngine';
import {
  isDownloadPending,
  loadSyncPrefs,
  refreshDownloadState,
  useSyncPrefsStore,
} from './infrastructure/syncPrefsService';

/** Pasado este tiempo sin descargar se pide preparar el teléfono. */
export const PREPARE_PHONE_AFTER_MS = 24 * 60 * 60 * 1000;

export type PrepareReason = 'first' | 'stale' | 'pending';

/**
 * «Prepara el teléfono antes de salir» (contrato v2): nunca se ha descargado
 * (primer inicio de sesión: invitación, no descarga sola), la última descarga
 * tiene más de 24 h, o hay elecciones pendientes de descargar.
 */
export function shouldPreparePhone(input: {
  loggedIn: boolean;
  lastDownloadAt: number | null;
  pendingDownload: boolean;
  now?: number;
}): PrepareReason | null {
  if (!input.loggedIn) return null;
  const now = input.now ?? Date.now();
  if (!input.lastDownloadAt) return 'first';
  if (input.pendingDownload) return 'pending';
  if (now - input.lastDownloadAt > PREPARE_PHONE_AFTER_MS) return 'stale';
  return null;
}

const PREPARE_LABELS: Record<PrepareReason, string> = {
  first: 'Prepara el teléfono antes de salir · elige qué llevar y descarga',
  stale: 'Prepara el teléfono antes de salir · la última descarga tiene más de 24 h',
  pending: 'Prepara el teléfono antes de salir · hay elecciones sin descargar',
};

function openPreparePhone() {
  try {
    router.push('/datos-sin-conexion' as never);
  } catch {
    // Sin navegador listo: al menos se sube la cola (la descarga es solo manual).
    void runSync('retry');
  }
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function SyncStatusBanner() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { online, status, pendingCount, failedCount, lastError, lastSyncedAt, setQueueVisible } = useSyncStore();
  const userId = useSyncStore((state) => state.userId);
  const pendingDownload = useSyncPrefsStore(isDownloadPending);
  const lastManualAt = useSyncPrefsStore((state) => state.lastManualAt);

  useEffect(() => {
    void refreshDownloadState();
    if (!online) return;
    const current = useSyncPrefsStore.getState().status;
    void loadSyncPrefs({ force: current === 'offline' || current === 'error' });
  }, [online, lastSyncedAt, userId]);

  const prepare = shouldPreparePhone({
    loggedIn: Boolean(userId),
    lastDownloadAt: lastManualAt ?? lastSyncedAt,
    pendingDownload,
  });
  const quiet = online && status === 'idle' && pendingCount === 0 && failedCount === 0 && !lastError;

  if (quiet && !prepare) return null;

  const background =
    !online || status === 'offline'
      ? colors.warning.main
      : status === 'error' || lastError || failedCount
        ? colors.error.main
        : quiet && prepare
          ? colors.warning.main
          : colors.primary.main;

  const failedLabel = failedCount ? plural(failedCount, 'cambio rechazado', 'cambios rechazados') : null;
  const pendingLabel = pendingCount ? plural(pendingCount, 'pendiente', 'pendientes') : null;

  let label: string;
  if (!online) {
    // No se promete "usando datos locales": solo negocios, cartera y clientes
    // con negocio se guardan en el teléfono; inventario y órdenes no tienen ni
    // una fila local, así que la franja no puede prometer datos que no existen.
    label = pendingLabel
      ? `Sin conexión · ${pendingLabel}`
      : 'Sin conexión · algunas pantallas no tendrán datos';
    if (failedLabel) label += ` · ${failedLabel}`;
  } else if (status === 'syncing') {
    label = 'Sincronizando…';
  } else if (failedLabel) {
    label = `${failedLabel} · toca para revisar`;
  } else if (lastError) {
    label = lastError;
  } else if (pendingCount) {
    label = `${plural(pendingCount, 'cambio', 'cambios')} por sincronizar`;
  } else if (prepare) {
    label = PREPARE_LABELS[prepare];
  } else {
    label = lastSyncedAt ? 'Sincronizado' : 'Sincronización';
  }

  const onPress = () => {
    if (failedCount || pendingCount) {
      setQueueVisible(true);
      return;
    }
    // v2: la descarga es solo manual y se prepara en su pantalla.
    if (prepare) {
      openPreparePhone();
      return;
    }
    // Solo sube la cola: bajar datos es exclusivo de «Descargar» (contrato v2).
    void runSync('retry');
  };

  return (
    <Pressable
      onPress={onPress}
      testID="sync-status-banner"
      style={[styles.banner, { backgroundColor: background, paddingTop: Math.max(insets.top, 6) }]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  text: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 12,
  },
});
