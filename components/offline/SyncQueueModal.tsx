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
  dismissSyncQueueNotice,
  listSyncQueue,
  listSyncQueueDependents,
  retrySyncQueueItem,
  type SyncQueueEntry,
} from '@/lib/offline/repositories/offlineRepository';
import { syncErrorText } from '@/lib/offline/sync/syncErrorText';

const TYPE_LABELS: Record<SyncQueueEntry['type'], string> = {
  register_pago: 'Pago',
  register_route_pago: 'Pago en ruta',
  create_customer: 'Cliente nuevo',
  attach_pago_support: 'Soporte de pago',
  update_route_stop: 'Novedad de visita',
  start_route: 'Ruta',
  finish_route: 'Ruta',
  select_route_stop: 'Ruta',
  upload_negocio_signature: 'Firma del negocio',
  create_negocio: 'Negocio nuevo',
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
    case 'done':
      return 'Enviado · con aviso';
    default:
      return entry.status;
  }
}

function formatMoney(value: number) {
  return `$ ${Math.round(value).toLocaleString('es-CO')}`;
}

/** Texto del aviso al descartar, según lo que se pierde. */
export function discardWarning(entry: Pick<SyncQueueEntry, 'type'>, dependents: number): string {
  if (entry.type === 'create_customer' && dependents > 0) {
    return `${dependents === 1 ? 'Hay 1 negocio que depende' : `Hay ${dependents} negocios que dependen`} de este cliente. Sin el cliente no pueden enviarse, así que se descartarán juntos: quedarán en el teléfono marcados como no enviados.`;
  }
  return 'El cambio no se enviará al servidor. Si era un pago, el saldo volverá a su valor anterior y el pago quedará en el negocio marcado como no aceptado, para que usted decida cuándo eliminarlo.';
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
  const noticeCount = useSyncStore((state) => state.noticeCount);
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
  }, [visible, refresh, pendingCount, failedCount, noticeCount, status]);

  const retry = async (entry: SyncQueueEntry) => {
    setBusyId(entry.id);
    try {
      const outcome = await retrySyncQueueItem(entry.id);
      if (!outcome.retried) Alert.alert('No se puede reintentar', outcome.reason);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const dismissNotice = async (entry: SyncQueueEntry) => {
    setBusyId(entry.id);
    try {
      await dismissSyncQueueNotice(entry.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const discard = async (entry: SyncQueueEntry) => {
    // Un cliente creado sin señal arrastra a los negocios que lo usan: se
    // avisa cuántos son y se descartan juntos, o no se descarta nada.
    const dependents = entry.type === 'create_customer' ? await listSyncQueueDependents(entry.id) : [];
    const detail = dependents.length
      ? `\n\n${dependents.map((row) => `• ${row.customerName || 'Negocio'} · ${formatMoney(row.totalCredit)}`).join('\n')}`
      : '';
    Alert.alert(
      dependents.length ? 'Descartar cliente y sus negocios' : 'Descartar cambio',
      `${discardWarning(entry, dependents.length)}${detail}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: dependents.length ? 'Descartar todo' : 'Descartar',
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
          <Pressable
            onPress={() => setVisible(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Cerrar la lista de cambios sin sincronizar"
          >
            <MaterialIcons name="close" size={26} color={colors.text.secondary} />
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          {pendingCount
            ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} de envío`
            : 'Nada pendiente de envío'}
          {failedCount ? ` · ${failedCount} rechazado${failedCount === 1 ? '' : 's'}` : ''}
          {noticeCount ? ` · ${noticeCount} aviso${noticeCount === 1 ? '' : 's'}` : ''}
        </Text>
        <Pressable
          // Solo envía la cola; la descarga vive en «Preparar el teléfono» (v2).
          onPress={() => void runSync('retry')}
          disabled={status === 'syncing'}
          accessibilityRole="button"
          accessibilityLabel={status === 'syncing' ? 'Sincronizando' : 'Sincronizar ahora'}
          accessibilityHint="Envía al servidor los cambios guardados en el teléfono"
          accessibilityState={{ disabled: status === 'syncing', busy: status === 'syncing' }}
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
              const notice = item.status === 'done';
              const busy = busyId === item.id;
              const typeLabel = TYPE_LABELS[item.type] || item.type;
              const errorText = syncErrorText(item.lastError);
              return (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.background.paper,
                      borderColor: terminal ? colors.error.main : notice ? colors.warning.main : colors.divider,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardType, { color: colors.text.primary }]}>{typeLabel}</Text>
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
                  {errorText ? (
                    <Text
                      style={[
                        styles.cardError,
                        { color: terminal ? colors.error.main : notice ? colors.text.primary : colors.text.secondary },
                      ]}
                    >
                      {errorText}
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    {notice ? (
                      <Pressable
                        onPress={() => void dismissNotice(item)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Entendido: ocultar el aviso de ${typeLabel}, ${item.summary}`}
                        accessibilityState={{ disabled: busy }}
                        style={[styles.actionButton, { backgroundColor: colors.primary.main }]}
                      >
                        <Text style={[styles.actionText, { color: colors.primary.contrastText }]}>Entendido</Text>
                      </Pressable>
                    ) : null}
                    {terminal ? (
                      <Pressable
                        onPress={() => void retry(item)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Reintentar ${typeLabel}, ${item.summary}`}
                        accessibilityState={{ disabled: busy }}
                        style={[styles.actionButton, { backgroundColor: colors.primary.main }]}
                      >
                        <Text style={[styles.actionText, { color: colors.primary.contrastText }]}>Reintentar</Text>
                      </Pressable>
                    ) : null}
                    {!notice ? (
                      <Pressable
                        onPress={() => void discard(item)}
                        disabled={busy || item.status === 'syncing'}
                        accessibilityRole="button"
                        accessibilityLabel={`Descartar ${typeLabel}, ${item.summary}`}
                        accessibilityState={{ disabled: busy || item.status === 'syncing' }}
                        style={[styles.actionButton, styles.discardButton, { borderColor: colors.error.main }]}
                      >
                        <Text style={[styles.actionText, { color: colors.error.main }]}>Descartar</Text>
                      </Pressable>
                    ) : null}
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
