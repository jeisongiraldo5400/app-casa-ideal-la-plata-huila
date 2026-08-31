import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { ExitMode, useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { formatPaymentDateTime } from '@/lib/localDate';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMyOrders } from '../infrastructure/hooks/useMyOrders';
import {
  PendingDeliveryOrder,
  RegisteredDeliveryOrder,
  RegisteredDeliveryOrderItem,
} from '../infrastructure/services/myOrdersService';

type OrdersTab = 'pending' | 'history';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  sent_by_remission: 'En remisión',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

function formatQuantity(quantity: number) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(quantity);
}

export function MyOrdersScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const orders = useMyOrders();
  const { refreshAll } = orders;
  const [activeTab, setActiveTab] = useState<OrdersTab>('pending');
  const [startingOrderId, setStartingOrderId] = useState<string | null>(null);
  const openingOrderRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
  );

  const openExit = async (order: PendingDeliveryOrder) => {
    if (!user || order.pending_quantity <= 0 || openingOrderRef.current) return;

    openingOrderRef.current = true;
    setStartingOrderId(order.id);
    try {
      const exits = useExitsStore.getState();
      const exitMode: ExitMode = order.customer_id ? 'direct_customer' : 'direct_user';

      exits.setExitMode(exitMode);
      if (exitMode === 'direct_customer') exits.setSelectedCustomer(order.customer_id);
      else exits.setSelectedUser(order.assigned_to_user_id || user.id);

      await exits.selectDeliveryOrder(order.id, {
        id: order.id,
        order_number: order.order_number,
        order_type: order.order_type,
        customer_id: order.customer_id || '',
        customer_name: order.customer_name || '',
        customer_id_number: order.customer_id_number || '',
        assigned_to_user_name: null,
        status: order.status,
        delivery_address: order.delivery_address,
        notes: order.notes,
        created_at: order.created_at,
        total_items: order.total_items,
        total_quantity: order.total_quantity,
        delivered_quantity: order.delivered_quantity,
      });

      let selectedState = useExitsStore.getState();
      if (!selectedState.selectedDeliveryOrderId) {
        Alert.alert('Orden no disponible', selectedState.error || 'No fue posible preparar la salida.');
        return;
      }
      if (!selectedState.canRegisterExit) {
        Alert.alert('Sin autorización', selectedState.authorizationMessage || 'No estás autorizado para registrar esta salida.');
        return;
      }

      selectedState.openExitConfirmation();
      selectedState = useExitsStore.getState();
      if (selectedState.step !== 'confirmation') {
        Alert.alert('No se pudo confirmar la salida', selectedState.error || 'Revisa los datos de la orden e intenta nuevamente.');
        return;
      }
      router.navigate('/(tabs)/exits');
    } catch (error) {
      Alert.alert(
        'No se pudo abrir la salida',
        error instanceof Error ? error.message : 'No fue posible preparar la salida.',
      );
    } finally {
      openingOrderRef.current = false;
      setStartingOrderId(null);
    }
  };

  const renderPendingOrder = ({ item }: { item: PendingDeliveryOrder }) => {
    const progress = item.total_quantity > 0
      ? Math.min((item.delivered_quantity / item.total_quantity) * 100, 100)
      : 0;
    const isStarting = startingOrderId === item.id;
    const isCustomerOrder = Boolean(item.customer_id);

    return (
      <TouchableOpacity
        testID={`assigned-order-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Registrar salida de ${item.order_number || 'orden sin consecutivo'}`}
        style={[
          styles.orderCard,
          {
            backgroundColor: colors.background.paper,
            borderColor: colors.divider,
            opacity: startingOrderId && !isStarting ? 0.6 : 1,
          },
        ]}
        disabled={Boolean(startingOrderId) || item.pending_quantity <= 0}
        onPress={() => openExit(item)}
        activeOpacity={0.82}
      >
        <View style={styles.orderTopRow}>
          <View style={styles.orderTitleArea}>
            <Text style={[styles.orderNumber, { color: colors.text.primary }]}>
              {item.order_number || 'Orden sin consecutivo'}
            </Text>
            <Text style={[styles.orderType, { color: colors.text.secondary }]}>
              {isCustomerOrder ? 'Entrega a cliente' : 'Remisión interna'}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        <DetailRow
          icon={isCustomerOrder ? 'person-outline' : 'person-pin'}
          text={item.customer_name || (isCustomerOrder ? 'Cliente sin nombre' : 'Usuario asignado')}
        />
        {item.delivery_address ? <DetailRow icon="place" text={item.delivery_address} secondary /> : null}

        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>Pendiente por despachar</Text>
          <Text style={[styles.progressQuantity, { color: colors.text.primary }]}>
            {formatQuantity(item.pending_quantity)} / {formatQuantity(item.total_quantity)}
          </Text>
        </View>
        <ProgressBar progress={progress} />
        <Text style={[styles.itemsText, { color: colors.text.secondary }]}>
          {item.total_items} {item.total_items === 1 ? 'producto' : 'productos'}
        </Text>

        <View style={[styles.exitButton, { backgroundColor: colors.primary.main }]}>
          {isStarting
            ? <ActivityIndicator color={colors.primary.contrastText} />
            : <MaterialIcons name="local-shipping" size={19} color={colors.primary.contrastText} />}
          <Text style={[styles.exitButtonText, { color: colors.primary.contrastText }]}>
            {isStarting ? 'Preparando…' : 'Registrar salida'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHistoryOrder = ({ item }: { item: RegisteredDeliveryOrder }) => {
    const progress = item.total_quantity > 0
      ? Math.min((item.delivered_quantity / item.total_quantity) * 100, 100)
      : 0;
    const expanded = orders.expandedOrderId === item.id;
    const detail = orders.detailsByOrderId[item.id];

    return (
      <TouchableOpacity
        testID={`registered-order-${item.id}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => orders.toggleHistoryOrder(item.id)}
        activeOpacity={0.82}
        style={[styles.orderCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
      >
        <View style={styles.orderTopRow}>
          <View style={styles.orderTitleArea}>
            <Text style={[styles.orderNumber, { color: colors.text.primary }]}>
              {item.order_number || 'Orden sin consecutivo'}
            </Text>
            <Text style={[styles.orderType, { color: colors.text.secondary }]}>
              Última salida: {formatPaymentDateTime(item.last_exit_at)}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        <DetailRow
          icon={item.recipient_type === 'customer' ? 'person-outline' : 'person-pin'}
          text={item.recipient_name || 'Destinatario sin nombre'}
        />
        {item.delivery_address ? <DetailRow icon="place" text={item.delivery_address} secondary /> : null}

        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>Registrado por ti</Text>
          <Text style={[styles.progressQuantity, { color: colors.primary.main }]}>
            {formatQuantity(item.my_active_quantity)} de {formatQuantity(item.total_quantity)}
          </Text>
        </View>
        <ProgressBar progress={progress} />

        <View style={styles.historyBadges}>
          <View style={[styles.smallBadge, { backgroundColor: colors.success.main + '18' }]}>
            <MaterialIcons name="check-circle" size={14} color={colors.success.main} />
            <Text style={[styles.smallBadgeText, { color: colors.success.main }]}>
              {item.my_active_exit_count} {item.my_active_exit_count === 1 ? 'registro' : 'registros'}
            </Text>
          </View>
          {item.my_cancelled_exit_count > 0 ? (
            <View style={[styles.smallBadge, { backgroundColor: colors.error.main + '18' }]}>
              <MaterialIcons name="cancel" size={14} color={colors.error.main} />
              <Text style={[styles.smallBadgeText, { color: colors.error.main }]}>
                {item.my_cancelled_exit_count} {item.my_cancelled_exit_count === 1 ? 'cancelado' : 'cancelados'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.expandHint, { borderTopColor: colors.divider }]}>
          <Text style={[styles.expandHintText, { color: colors.primary.main }]}>
            {expanded ? 'Ocultar mis productos' : 'Ver mis productos registrados'}
          </Text>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={colors.primary.main} />
        </View>

        {expanded ? <HistoryDetail orderId={item.id} detail={detail} /> : null}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = (history: boolean) => (
    <View style={[styles.messageCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <MaterialIcons name={history ? 'history' : 'assignment-turned-in'} size={38} color={colors.success.main} />
      <Text style={[styles.messageTitle, { color: colors.text.primary }]}>
        {history
          ? (orders.historySearch ? 'No hay coincidencias' : 'Aún no has registrado salidas')
          : (orders.pendingOrders.length ? 'No hay coincidencias' : 'No tienes órdenes pendientes')}
      </Text>
      <Text style={[styles.messageText, { color: colors.text.secondary }]}>
        {history
          ? (orders.historySearch ? 'Prueba con otro término de búsqueda.' : 'Las órdenes en las que registres productos aparecerán aquí.')
          : (orders.pendingOrders.length ? 'Prueba con otro término de búsqueda.' : 'Cuando te asignen una orden de entrega aparecerá aquí.')}
      </Text>
    </View>
  );

  const renderErrorState = (message: string, retry: () => void) => (
    <View style={[styles.messageCard, { backgroundColor: colors.background.paper, borderColor: colors.error.main + '55' }]}>
      <MaterialIcons name="error-outline" size={30} color={colors.error.main} />
      <Text style={[styles.messageTitle, { color: colors.text.primary }]}>No se pudieron cargar las órdenes</Text>
      <Text style={[styles.messageText, { color: colors.text.secondary }]}>{message}</Text>
      <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary.main }]} onPress={retry}>
        <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  const isPending = activeTab === 'pending';
  const initialLoading = isPending
    ? orders.pendingLoading && orders.pendingOrders.length === 0
    : orders.historyInitialLoading && orders.historyOrders.length === 0;
  const blockingError = isPending ? orders.pendingError : orders.historyError;
  const currentDataEmpty = isPending
    ? orders.filteredPendingOrders.length === 0
    : orders.historyOrders.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <Text style={[styles.header, { color: colors.text.secondary }]}>Pendientes e historial de salidas registradas</Text>

      <View style={[styles.tabs, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
        <TabButton label="Pendientes" count={orders.pendingOrders.length} selected={isPending} onPress={() => setActiveTab('pending')} />
        <TabButton label="Mis entregas" count={orders.historyTotalCount} selected={!isPending} onPress={() => setActiveTab('history')} />
      </View>

      <SearchBox
        value={isPending ? orders.pendingSearch : orders.historySearch}
        onChangeText={isPending ? orders.setPendingSearch : orders.setHistorySearch}
        placeholder={isPending ? 'Buscar por orden, cliente o destino' : 'Buscar por orden, producto o destinatario'}
        loading={!isPending && orders.historyInitialLoading && orders.historyOrders.length > 0}
      />

      {initialLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={[styles.stateText, { color: colors.text.secondary }]}>Cargando órdenes…</Text>
        </View>
      ) : blockingError && currentDataEmpty ? (
        renderErrorState(blockingError, isPending ? () => void orders.loadPending() : () => void orders.refreshHistory())
      ) : isPending ? (
        <FlatList
          testID="pending-orders-list"
          data={orders.filteredPendingOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderPendingOrder}
          contentContainerStyle={[styles.listContent, currentDataEmpty && styles.emptyListContent]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={orders.pendingRefreshing} onRefresh={() => void orders.loadPending(true)} tintColor={colors.primary.main} />}
          ListHeaderComponent={blockingError ? <InlineError message={blockingError} /> : null}
          ListEmptyComponent={renderEmptyState(false)}
        />
      ) : (
        <FlatList
          testID="registered-orders-list"
          data={orders.historyOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderHistoryOrder}
          contentContainerStyle={[styles.listContent, currentDataEmpty && styles.emptyListContent]}
          keyboardShouldPersistTaps="handled"
          onEndReached={orders.loadMoreHistory}
          onEndReachedThreshold={0.35}
          refreshControl={<RefreshControl refreshing={orders.historyRefreshing} onRefresh={() => void orders.refreshHistory()} tintColor={colors.primary.main} />}
          ListHeaderComponent={blockingError ? <InlineError message={blockingError} /> : null}
          ListEmptyComponent={renderEmptyState(true)}
          ListFooterComponent={orders.historyLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={colors.primary.main} />
              <Text style={[styles.stateText, { color: colors.text.secondary }]}>Cargando más órdenes…</Text>
            </View>
          ) : null}
        />
      )}
    </View>
  );

  function StatusBadge({ status }: { status: string }) {
    const statusColor = status === 'delivered' ? colors.success.main : status === 'cancelled' ? colors.error.main : colors.warning.main;
    return (
      <View style={[styles.statusBadge, { backgroundColor: statusColor + '1A' }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[status] || status}</Text>
      </View>
    );
  }

  function DetailRow({ icon, text, secondary = false }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; text: string; secondary?: boolean }) {
    return (
      <View style={styles.detailRow}>
        <MaterialIcons name={icon} size={18} color={colors.text.secondary} />
        <Text style={[styles.detailText, { color: secondary ? colors.text.secondary : colors.text.primary }]} numberOfLines={1}>{text}</Text>
      </View>
    );
  }

  function ProgressBar({ progress }: { progress: number }) {
    return <View style={[styles.progressTrack, { backgroundColor: colors.divider }]}><View style={[styles.progressValue, { width: `${progress}%`, backgroundColor: colors.success.main }]} /></View>;
  }

  function TabButton({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.tabButton, selected && { backgroundColor: colors.primary.main }]}>
        <Text style={[styles.tabLabel, { color: selected ? colors.primary.contrastText : colors.text.secondary }]} numberOfLines={1}>{label}</Text>
        <View style={[styles.tabCount, { backgroundColor: selected ? colors.primary.contrastText + '25' : colors.divider }]}>
          <Text style={[styles.tabCountText, { color: selected ? colors.primary.contrastText : colors.text.primary }]}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  function SearchBox({ value, onChangeText, placeholder, loading }: { value: string; onChangeText: (text: string) => void; placeholder: string; loading: boolean }) {
    return (
      <View style={[styles.searchBox, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
        <MaterialIcons name="search" size={21} color={colors.text.secondary} />
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.text.secondary} style={[styles.searchInput, { color: colors.text.primary }]} autoCapitalize="none" returnKeyType="search" />
        {loading ? <ActivityIndicator size="small" color={colors.primary.main} /> : null}
        {value ? <TouchableOpacity accessibilityLabel="Limpiar búsqueda" onPress={() => onChangeText('')} hitSlop={8}><MaterialIcons name="close" size={20} color={colors.text.secondary} /></TouchableOpacity> : null}
      </View>
    );
  }

  function HistoryDetail({ orderId, detail }: { orderId: string; detail: { items: RegisteredDeliveryOrderItem[]; loading: boolean; error: string | null } | undefined }) {
    if (!detail || detail.loading) return <View style={styles.detailLoading}><ActivityIndicator color={colors.primary.main} /></View>;
    if (detail.error) {
      return (
        <View style={[styles.detailError, { backgroundColor: colors.error.main + '12' }]}>
          <Text style={[styles.detailErrorText, { color: colors.error.main }]}>{detail.error}</Text>
          <TouchableOpacity onPress={() => orders.retryHistoryDetail(orderId)}><Text style={[styles.detailRetry, { color: colors.primary.main }]}>Reintentar</Text></TouchableOpacity>
        </View>
      );
    }
    if (detail.items.length === 0) return <Text style={[styles.detailEmpty, { color: colors.text.secondary }]}>No hay productos disponibles.</Text>;
    return (
      <View style={[styles.historyDetail, { borderTopColor: colors.divider }]}>
        {detail.items.map((item) => (
          <View key={item.exit_id} style={[styles.historyItem, { borderBottomColor: colors.divider }]}>
            <View style={styles.historyItemTop}>
              <View style={styles.historyItemNameArea}>
                <Text style={[styles.historyItemName, { color: colors.text.primary }]}>{item.product_name}</Text>
                <Text style={[styles.historyItemMeta, { color: colors.text.secondary }]}>{item.product_sku ? `SKU ${item.product_sku} · ` : ''}{item.warehouse_name}</Text>
              </View>
              <Text style={[styles.historyItemQuantity, { color: item.is_cancelled ? colors.error.main : colors.primary.main }]}>{formatQuantity(item.quantity)}</Text>
            </View>
            <Text style={[styles.historyItemMeta, { color: colors.text.secondary }]}>{formatPaymentDateTime(item.created_at)}</Text>
            {item.is_cancelled ? (
              <View style={[styles.cancelledNotice, { backgroundColor: colors.error.main + '12' }]}>
                <MaterialIcons name="cancel" size={14} color={colors.error.main} />
                <Text style={[styles.cancelledNoticeText, { color: colors.error.main }]}>Cancelada{item.cancellation_observations ? `: ${item.cancellation_observations}` : ''}</Text>
              </View>
            ) : null}
            {item.delivery_observations ? <Text style={[styles.observations, { color: colors.text.secondary }]}>Nota: {item.delivery_observations}</Text> : null}
          </View>
        ))}
      </View>
    );
  }

  function InlineError({ message }: { message: string }) {
    return <View style={[styles.inlineError, { backgroundColor: colors.error.main + '12', borderColor: colors.error.main + '55' }]}><MaterialIcons name="error-outline" size={18} color={colors.error.main} /><Text style={[styles.inlineErrorText, { color: colors.error.main }]}>{message}</Text></View>;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 13, marginBottom: Spacing.md, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  tabs: { flexDirection: 'row', marginHorizontal: Spacing.xl, borderWidth: 1, borderRadius: Radius.control, padding: 4, gap: 4 },
  tabButton: { flex: 1, minHeight: 40, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 7 },
  tabLabel: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
  tabCount: { minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { fontSize: 11, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginTop: Spacing.md, paddingHorizontal: Spacing.lg, height: 52, borderWidth: 1, borderRadius: Radius.control, gap: Spacing.sm },
  searchInput: { flex: 1, fontSize: 14, height: '100%' },
  listContent: { padding: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  emptyListContent: { justifyContent: 'center' },
  stateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 30 },
  stateText: { fontSize: 14 },
  messageCard: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.xxl, alignItems: 'center', gap: 10, marginHorizontal: Spacing.xl, marginVertical: Spacing.xxl },
  messageTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  messageText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 2 },
  inlineErrorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  orderCard: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.lg, gap: 10, ...Shadows.card },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  orderTitleArea: { flex: 1 },
  orderNumber: { fontSize: 17, fontWeight: '800' },
  orderType: { fontSize: 12, marginTop: 3 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  detailText: { flex: 1, fontSize: 13 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  progressLabel: { fontSize: 12 },
  progressQuantity: { fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 99, overflow: 'hidden' },
  progressValue: { height: '100%', borderRadius: 99 },
  itemsText: { fontSize: 12, marginTop: -3 },
  exitButton: { height: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  exitButtonText: { fontSize: 14, fontWeight: '800' },
  historyBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  smallBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5 },
  smallBadgeText: { fontSize: 11, fontWeight: '700' },
  expandHint: { borderTopWidth: 1, paddingTop: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 3 },
  expandHintText: { fontSize: 12, fontWeight: '800' },
  detailLoading: { paddingVertical: 18, alignItems: 'center' },
  detailError: { borderRadius: 10, padding: 12, gap: 8, alignItems: 'center' },
  detailErrorText: { fontSize: 12, textAlign: 'center' },
  detailRetry: { fontSize: 13, fontWeight: '800' },
  detailEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 14 },
  historyDetail: { borderTopWidth: 1, paddingTop: 4 },
  historyItem: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, gap: 5 },
  historyItemTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  historyItemNameArea: { flex: 1 },
  historyItemName: { fontSize: 14, fontWeight: '700' },
  historyItemMeta: { fontSize: 11, marginTop: 2 },
  historyItemQuantity: { fontSize: 17, fontWeight: '800' },
  cancelledNotice: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 7, padding: 7 },
  cancelledNoticeText: { flex: 1, fontSize: 11, fontWeight: '600' },
  observations: { fontSize: 11, fontStyle: 'italic' },
  loadingMore: { paddingVertical: 18, alignItems: 'center', gap: 8 },
});
