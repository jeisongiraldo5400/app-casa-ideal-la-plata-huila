import { useExitsStore, type DeliveryOrder } from '@/components/exits/infrastructure/store/exitsStore';
import { getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getVisibleDeliveryOrders, ORDER_PAGE_SIZE } from '../utils/deliveryOrderPagination';

function asQuantity(value: unknown): number {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-CO');
}

export function DeliveryOrderSelector() {
  const {
    exitMode,
    selectedCustomerId,
    selectedUserId,
    deliveryOrders,
    selectedDeliveryOrderId,
    loading,
    error,
    searchDeliveryOrdersByCustomer,
    searchDeliveryOrdersByUser,
    selectDeliveryOrder,
  } = useExitsStore();

  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const [visibleCount, setVisibleCount] = useState(ORDER_PAGE_SIZE);
  const [selectingOrderId, setSelectingOrderId] = useState<string | null>(null);
  const selectingRef = useRef(false);
  const destinationId = exitMode === 'direct_user' ? selectedUserId : selectedCustomerId;
  const isRemissionMode = exitMode === 'direct_user';
  const pluralLabel = isRemissionMode ? 'remisiones' : 'órdenes de entrega';

  const refresh = useCallback(() => {
    if (exitMode === 'direct_customer' && selectedCustomerId) {
      return searchDeliveryOrdersByCustomer(selectedCustomerId);
    }
    if (exitMode === 'direct_user' && selectedUserId) {
      return searchDeliveryOrdersByUser(selectedUserId);
    }
    return Promise.resolve();
  }, [exitMode, selectedCustomerId, selectedUserId, searchDeliveryOrdersByCustomer, searchDeliveryOrdersByUser]);

  useEffect(() => {
    setVisibleCount(ORDER_PAGE_SIZE);
    void refresh();
  }, [destinationId, exitMode, refresh]);

  const visibleOrders = useMemo(
    () => getVisibleDeliveryOrders(deliveryOrders, visibleCount),
    [deliveryOrders, visibleCount],
  );
  const hasMore = visibleOrders.length < deliveryOrders.length;

  const handleSelectOrder = useCallback(async (order: DeliveryOrder) => {
    if (selectingRef.current || useExitsStore.getState().loading) return;

    selectingRef.current = true;
    setSelectingOrderId(order.id);
    try {
      await selectDeliveryOrder(order.id, order);
      const state = useExitsStore.getState();
      if (state.selectedDeliveryOrderId === order.id) {
        state.openExitConfirmation();
      }
    } finally {
      selectingRef.current = false;
      setSelectingOrderId(null);
    }
  }, [selectDeliveryOrder]);

  if (loading && deliveryOrders.length === 0) {
    return (
      <View style={styles.stateContainer} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={Colors.primary.main} />
        <Text style={[styles.stateText, { color: Colors.text.secondary }]}>Cargando {pluralLabel}...</Text>
      </View>
    );
  }

  if (deliveryOrders.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <MaterialIcons name="inbox" size={38} color={Colors.text.secondary} />
        <Text style={[styles.emptyTitle, { color: Colors.text.primary }]}>No hay {pluralLabel} pendientes</Text>
        <Text style={[styles.stateText, { color: Colors.text.secondary }]}>El destinatario seleccionado no tiene entregas disponibles.</Text>
        <TouchableOpacity onPress={() => void refresh()} style={styles.retryButton} accessibilityRole="button">
          <MaterialIcons name="refresh" size={18} color={Colors.primary.main} />
          <Text style={{ color: Colors.primary.main, fontWeight: '700' }}>Actualizar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: Colors.text.primary }]}>Seleccione {isRemissionMode ? 'la remisión' : 'la orden'}</Text>
          <Text style={[styles.subtitle, { color: Colors.text.secondary }]}>Mostrando {visibleOrders.length} de {deliveryOrders.length}</Text>
        </View>
        <TouchableOpacity onPress={() => void refresh()} disabled={loading} style={styles.iconButton} accessibilityLabel={`Actualizar ${pluralLabel}`}>
          {loading ? <ActivityIndicator size="small" color={Colors.primary.main} /> : <MaterialIcons name="refresh" size={21} color={Colors.primary.main} />}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.inlineError, { backgroundColor: `${Colors.error.main}14`, borderColor: Colors.error.main }]} accessibilityLiveRegion="assertive">
          <MaterialIcons name="error-outline" size={19} color={Colors.error.main} />
          <Text style={[styles.inlineErrorText, { color: Colors.error.main }]}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.table, { backgroundColor: Colors.background.paper, borderColor: Colors.divider }]}>
        <View style={[styles.tableHeader, { borderBottomColor: Colors.divider }]}>
          <Text style={[styles.headerMain, { color: Colors.text.secondary }]}>ENTREGA</Text>
          <Text style={[styles.headerPending, { color: Colors.text.secondary }]}>PENDIENTE</Text>
        </View>

        {visibleOrders.map((order, index) => (
          <OrderRow
            key={order.id}
            order={order}
            isLast={index === visibleOrders.length - 1}
            selected={selectedDeliveryOrderId === order.id}
            disabled={loading || selectingOrderId !== null}
            selecting={selectingOrderId === order.id}
            colors={Colors}
            onPress={() => void handleSelectOrder(order)}
          />
        ))}
      </View>

      {hasMore ? (
        <TouchableOpacity
          onPress={() => setVisibleCount((current) => current + ORDER_PAGE_SIZE)}
          style={[styles.loadMore, { borderColor: Colors.divider }]}
          accessibilityRole="button"
          accessibilityLabel={`Cargar ${Math.min(ORDER_PAGE_SIZE, deliveryOrders.length - visibleOrders.length)} ${pluralLabel} más`}>
          <Text style={{ color: Colors.primary.main, fontWeight: '700' }}>Cargar 5 más</Text>
          <MaterialIcons name="expand-more" size={20} color={Colors.primary.main} />
        </TouchableOpacity>
      ) : (
        <Text style={[styles.endText, { color: Colors.text.secondary }]}>Todas las {pluralLabel} disponibles están visibles</Text>
      )}
    </View>
  );
}

type OrderRowProps = {
  order: DeliveryOrder;
  selected: boolean;
  isLast: boolean;
  disabled: boolean;
  selecting: boolean;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
};

function OrderRow({ order, selected, selecting, isLast, disabled, colors, onPress }: OrderRowProps) {
  const total = asQuantity(order.total_quantity);
  const delivered = Math.min(total, asQuantity(order.delivered_quantity));
  const pending = Math.max(0, total - delivered);
  const progress = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const partial = delivered > 0;
  const destination = order.customer_name || order.assigned_to_user_name || 'Destinatario';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${destination}, ${pending} unidades pendientes`}
      style={[
        styles.row,
        !isLast && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth },
        selected && { backgroundColor: `${colors.primary.light}20`, borderLeftColor: colors.primary.main, borderLeftWidth: 4 },
      ]}>
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.destination, { color: colors.text.primary }]} numberOfLines={1}>{destination}</Text>
          <View style={[styles.status, { backgroundColor: partial ? `${colors.warning.main}18` : `${colors.primary.main}14` }]}>
            <Text style={[styles.statusText, { color: partial ? colors.warning.main : colors.primary.main }]}>{partial ? 'Parcial' : 'Pendiente'}</Text>
          </View>
        </View>
        <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
          {formatDate(order.created_at)} · {asQuantity(order.total_items)} productos · #{order.order_number || order.id.slice(0, 8)}
        </Text>
        {partial && (
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.divider }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.success.main, width: `${progress}%` }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.text.secondary }]}>{progress}%</Text>
          </View>
        )}
      </View>
      <View style={styles.pendingColumn}>
        <Text style={[styles.pendingQuantity, { color: pending > 0 ? colors.text.primary : colors.success.main }]}>{pending}</Text>
        <Text style={[styles.unitsLabel, { color: colors.text.secondary }]}>unid.</Text>
      </View>
      {selecting ? (
        <ActivityIndicator size="small" color={colors.primary.main} />
      ) : (
        <MaterialIcons name={selected ? 'check-circle' : 'chevron-right'} size={22} color={selected ? colors.primary.main : colors.text.secondary} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20, marginTop: 4 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  headingCopy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  iconButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  table: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  tableHeader: { borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8 },
  headerMain: { flex: 1, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  headerPending: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, width: 68 },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 74, paddingHorizontal: 12, paddingVertical: 10 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitleLine: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  destination: { flex: 1, fontSize: 14, fontWeight: '800' },
  status: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  meta: { fontSize: 11, marginTop: 5 },
  pendingColumn: { alignItems: 'center', marginLeft: 8, width: 48 },
  pendingQuantity: { fontSize: 17, fontWeight: '800' },
  unitsLabel: { fontSize: 10 },
  progressRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 7 },
  progressTrack: { borderRadius: 3, flex: 1, height: 5, overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressText: { fontSize: 10, width: 28 },
  loadMore: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: 10, padding: 11 },
  endText: { fontSize: 11, marginTop: 9, textAlign: 'center' },
  stateContainer: { alignItems: 'center', marginBottom: 20, paddingHorizontal: 20, paddingVertical: 24 },
  stateText: { fontSize: 13, marginTop: 7, textAlign: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  retryButton: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 12, padding: 8 },
  inlineError: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 10, padding: 10 },
  inlineErrorText: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 17 },
});
