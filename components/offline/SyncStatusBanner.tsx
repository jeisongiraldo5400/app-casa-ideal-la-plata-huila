import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { runSync } from '@/lib/offline/sync/syncEngine';

export function SyncStatusBanner() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { online, status, pendingCount, lastError, lastSyncedAt } = useSyncStore();

  if (online && status === 'idle' && pendingCount === 0 && !lastError) return null;

  const background =
    !online || status === 'offline'
      ? colors.warning.main
      : status === 'error' || lastError
        ? colors.error.main
        : colors.primary.main;

  const label = !online
    ? pendingCount
      ? `Sin conexión · ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`
      : 'Sin conexión · usando datos locales'
    : status === 'syncing'
      ? 'Sincronizando…'
      : lastError
        ? lastError
        : pendingCount
          ? `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} por sincronizar`
          : lastSyncedAt
            ? 'Sincronizado'
            : 'Sincronización';

  return (
    <Pressable
      onPress={() => void runSync('manual')}
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
