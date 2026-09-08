import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { runSync } from '@/lib/offline/sync/syncEngine';
import {
  discardSyncQueueItem,
  listSyncQueue,
  retrySyncQueueItem,
  type SyncQueueEntry,
} from '@/lib/offline/repositories/offlineRepository';

const TYPE_LABELS: Record<SyncQueueEntry['type'], string> = {
  register_pago: 'Pago',
  register_route_pago: 'Pago en ruta',
  create_customer: 'Cliente nuevo',
  attach_pago_support: 'Soporte de pago',
  update_route_stop: 'Novedad de visita',
  start_route: 'Ruta',
  finish_route: 'Ruta',
  select_route_stop: 'Ruta',
};

function statusLabel(entry: SyncQueueEntry) {
  switch (entry.status) {
    case 'pending':
      return 'Pendiente de envío';
    case 'syncing':
      return 'Enviando…';
    case 'error':
      return `Reintentando (${entry.attempts})`;
    case 'failed':
      return 'Rechazado';
    case 'conflict':
      return 'Conflicto';
    default:
      return entry.status;
  }
}

function formatDate(value: number) {
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Cola de sincronización visible para el usuario: muestra lo pendiente y lo
 * rechazado, y permite reintentar o descartar (revirtiendo el efecto local).
 */
export function SyncQueueModal() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const visible = useSyncStore((state) => state.queueVisible);
  const setVisible = useSyncStore((state) => state.setQueueVisible);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const failedCount = useSyncStore((state) => state.failedCount);
  const status = useSyncStore((state) => state.status);
  const [entries, setEntries] = useState<SyncQueueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listSyncQueue());
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh, pendingCount, failedCount, status]);

  const retry = async (entry: SyncQueueEntry) => {
    setBusyId(entry.id);
    try {
      await retrySyncQueueItem(entry.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const discard = (entry: SyncQueueEntry) => {
    Alert.alert(
      'Descartar cambio',
      'El cambio se eliminará del dispositivo y no se enviará al servidor. Si era un pago, el saldo local volverá a su valor anterior.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            setBusyId(entry.id);
            try {
              await discardSyncQueueItem(entry.id);
              await refresh();
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const isTerminal = (entry: SyncQueueEntry) => entry.status === 'failed' || entry.status === 'conflict';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background.default, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Cambios sin sincronizar</Text>
          <Pressable onPress={() => setVisible(false)} hitSlop={12} accessibilityLabel="Cerrar">
            <MaterialIcons name="close" size={26} color={colors.text.secondary} />
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          {pendingCount
            ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} de envío`
            : 'Nada pendiente de envío'}
          {failedCount ? ` · ${failedCount} rechazado${failedCount === 1 ? '' : 's'}` : ''}
        </Text>
        <Pressable
          onPress={() => void runSync('manual')}
          disabled={status === 'syncing'}
          style={[styles.syncButton, { backgroundColor: colors.primary.main, opacity: status === 'syncing' ? 0.6 : 1 }]}
        >
          {status === 'syncing' ? (
            <ActivityIndicator color={colors.primary.contrastText} />
          ) : (
            <MaterialIcons name="sync" size={18} color={colors.primary.contrastText} />
          )}
          <Text style={[styles.syncButtonText, { color: colors.primary.contrastText }]}>
            {status === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Text>
        </Pressable>

        {loading && !entries.length ? (
          <ActivityIndicator style={styles.loader} color={colors.primary.main} />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.text.secondary }]}>
                Todo está sincronizado.
              </Text>
            }
            renderItem={({ item }) => {
              const terminal = isTerminal(item);
              return (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.background.paper,
                      borderColor: terminal ? colors.error.main : colors.divider,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardType, { color: colors.text.primary }]}>{TYPE_LABELS[item.type] || item.type}</Text>
                    <Text
                      style={[
                        styles.cardStatus,
                        { color: terminal ? colors.error.main : colors.text.secondary },
                      ]}
                    >
                      {statusLabel(item)}
                    </Text>
                  </View>
                  <Text style={[styles.cardSummary, { color: colors.text.primary }]}>{item.summary}</Text>
                  <Text style={[styles.cardMeta, { color: colors.text.secondary }]}>Guardado {formatDate(item.queuedAt)}</Text>
                  {item.lastError ? (
                    <Text style={[styles.cardError, { color: terminal ? colors.error.main : colors.text.secondary }]}>
                      {item.lastError}
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    {terminal ? (
                      <Pressable
                        onPress={() => void retry(item)}
                        disabled={busyId === item.id}
                        style={[styles.actionButton, { backgroundColor: colors.primary.main }]}
                      >
                        <Text style={[styles.actionText, { color: colors.primary.contrastText }]}>Reintentar</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => discard(item)}
                      disabled={busyId === item.id || item.status === 'syncing'}
                      style={[styles.actionButton, styles.discardButton, { borderColor: colors.error.main }]}
                    >
                      <Text style={[styles.actionText, { color: colors.error.main }]}>Descartar</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { paddingHorizontal: 20, marginTop: 4 },
  syncButton: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  syncButtonText: { fontWeight: '700' },
  loader: { marginTop: 32 },
  list: { padding: 20, gap: 12 },
  empty: { textAlign: 'center', marginTop: 24 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType: { fontWeight: '800' },
  cardStatus: { fontSize: 12, fontWeight: '700' },
  cardSummary: { fontSize: 15 },
  cardMeta: { fontSize: 12 },
  cardError: { fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  discardButton: { borderWidth: 1 },
  actionText: { fontWeight: '700', fontSize: 13 },
});
