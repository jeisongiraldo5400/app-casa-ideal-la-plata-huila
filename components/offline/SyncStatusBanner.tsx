import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { runSync } from '@/lib/offline/sync/syncEngine';
import { useUserRoles } from '@/hooks/useUserRoles';
import { loadSyncPrefs, useSyncPrefsStore, type SyncConfig } from './infrastructure/syncPrefsService';

/** Pasado este tiempo sin descargar se pide preparar el teléfono. */
export const PREPARE_PHONE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * «Prepara el teléfono antes de salir»: la última descarga tiene más de 24 h
 * o un dominio está en «Solo lo que elijo» sin nada marcado. Solo cuentan los
 * dominios que el usuario marca de verdad (`markable`): al gestor de cobro los
 * clientes le llegan por sus negocios y no tendría cómo apagar el aviso.
 */
export function shouldPreparePhone(input: {
  lastSyncedAt: number | null;
  prefsReady: boolean;
  config: SyncConfig;
  markable: ('clientes' | 'productos')[];
  now?: number;
}) {
  const now = input.now ?? Date.now();
  if (input.lastSyncedAt && now - input.lastSyncedAt > PREPARE_PHONE_AFTER_MS) return true;
  if (!input.prefsReady) return false;
  return input.markable.some(
    (domain) => input.config[domain].mode === 'seleccion' && input.config[domain].count === 0
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function SyncStatusBanner() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { online, status, pendingCount, failedCount, lastError, lastSyncedAt, setQueueVisible } = useSyncStore();
  const prefsStatus = useSyncPrefsStore((state) => state.status);
  const prefsConfig = useSyncPrefsStore((state) => state.config);
  const { isAdmin, isVendedor, onlyFindsBySearch } = useUserRoles();

  useEffect(() => {
    if (online) void loadSyncPrefs();
  }, [online, lastSyncedAt]);

  const markable: ('clientes' | 'productos')[] =
    !onlyFindsBySearch() && (isAdmin() || isVendedor()) ? ['clientes', 'productos'] : [];
  const prepare = shouldPreparePhone({
    lastSyncedAt,
    prefsReady: prefsStatus === 'ready',
    config: prefsConfig,
    markable,
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
    label = 'Prepara el teléfono antes de salir · toca para descargar';
  } else {
    label = lastSyncedAt ? 'Sincronizado' : 'Sincronización';
  }

  const onPress = () => {
    if (failedCount || pendingCount) {
      setQueueVisible(true);
      return;
    }
    void runSync('manual');
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
