import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { runSync } from '@/lib/offline/sync/syncEngine';

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function SyncStatusBanner() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { online, status, pendingCount, failedCount, lastError, lastSyncedAt, setQueueVisible } = useSyncStore();

  if (online && status === 'idle' && pendingCount === 0 && failedCount === 0 && !lastError) return null;

  const background =
    !online || status === 'offline'
      ? colors.warning.main
      : status === 'error' || lastError || failedCount
        ? colors.error.main
        : colors.primary.main;

  const failedLabel = failedCount ? plural(failedCount, 'cambio rechazado', 'cambios rechazados') : null;
  const pendingLabel = pendingCount ? plural(pendingCount, 'pendiente', 'pendientes') : null;

  let label: string;
  if (!online) {
    label = pendingLabel ? `Sin conexión · ${pendingLabel}` : 'Sin conexión · usando datos locales';
    if (failedLabel) label += ` · ${failedLabel}`;
  } else if (status === 'syncing') {
    label = 'Sincronizando…';
  } else if (failedLabel) {
    label = `${failedLabel} · toca para revisar`;
  } else if (lastError) {
    label = lastError;
  } else if (pendingCount) {
    label = `${plural(pendingCount, 'cambio', 'cambios')} por sincronizar`;
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
