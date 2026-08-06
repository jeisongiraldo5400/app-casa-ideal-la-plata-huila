import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { ExitMode, useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type AuthorizedDeliveryOrder =
  Database['public']['Functions']['get_my_authorized_delivery_orders']['Returns'][number];

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  sent_by_remission: 'En remisión',
};

function formatQuantity(quantity: number) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(quantity);
}

export default function MyOrdersScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const [orders, setOrders] = useState<AuthorizedDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingOrderId, setStartingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (!user) {
      setOrders([]);
      setError('Inicia sesión para consultar tus órdenes asignadas.');
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('get_my_authorized_delivery_orders');

    if (rpcError) {
      setError(rpcError.message || 'No fue posible cargar las órdenes asignadas.');
      setOrders([]);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadOrders();
    }, [loadOrders]),
  );

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-CO');
    if (!term) return orders;

    return orders.filter((order) =>
      [order.order_number, order.customer_name, order.customer_id_number, order.delivery_address]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es-CO').includes(term)),
    );
  }, [orders, search]);

  const openExit = async (order: AuthorizedDeliveryOrder) => {
    if (!user || order.pending_quantity <= 0) return;

    setStartingOrderId(order.id);
    try {
      const exits = useExitsStore.getState();
      const exitMode: ExitMode = order.customer_id ? 'direct_customer' : 'direct_user';

      exits.setExitMode(exitMode);
      if (exitMode === 'direct_customer') {
        exits.setSelectedCustomer(order.customer_id);
      } else {
        exits.setSelectedUser(order.assigned_to_user_id || user.id);
      }

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

      selectedState.startExit();
      selectedState = useExitsStore.getState();
      if (selectedState.step !== 'scanning') {
        Alert.alert('No se pudo iniciar la salida', selectedState.error || 'Revisa los datos de la orden e intenta nuevamente.');
        return;
      }

      router.push('/(tabs)/exits');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible preparar la salida.';
      Alert.alert('No se pudo abrir la salida', message);
    } finally {
      setStartingOrderId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.warning.main + '18' }]}>
          <MaterialIcons name="assignment" size={24} color={colors.warning.main} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Mis órdenes</Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Órdenes autorizadas para registrar salidas</Text>
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
        <MaterialIcons name="search" size={21} color={colors.text.secondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por orden, cliente o destino"
          placeholderTextColor={colors.text.secondary}
          style={[styles.searchInput, { color: colors.text.primary }]}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <MaterialIcons name="close" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadOrders(true)} tintColor={colors.primary.main} />}
      >
        {loading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color={colors.primary.main} />
            <Text style={[styles.stateText, { color: colors.text.secondary }]}>Cargando órdenes asignadas…</Text>
          </View>
        ) : error ? (
          <View style={[styles.messageCard, { backgroundColor: colors.background.paper, borderColor: colors.error.main + '55' }]}>
            <MaterialIcons name="error-outline" size={28} color={colors.error.main} />
            <Text style={[styles.messageTitle, { color: colors.text.primary }]}>No se pudieron cargar las órdenes</Text>
            <Text style={[styles.messageText, { color: colors.text.secondary }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary.main }]} onPress={() => loadOrders()}>
              <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={[styles.messageCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <MaterialIcons name="assignment-turned-in" size={36} color={colors.success.main} />
            <Text style={[styles.messageTitle, { color: colors.text.primary }]}>
              {orders.length ? 'No hay coincidencias' : 'No tienes órdenes pendientes'}
            </Text>
            <Text style={[styles.messageText, { color: colors.text.secondary }]}>
              {orders.length ? 'Prueba con otro término de búsqueda.' : 'Cuando te autoricen una orden de entrega aparecerá aquí.'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.counter, { color: colors.text.secondary }]}>
              {filteredOrders.length} {filteredOrders.length === 1 ? 'orden asignada' : 'órdenes asignadas'}
            </Text>
            {filteredOrders.map((order) => {
              const progress = order.total_quantity > 0
                ? Math.min((order.delivered_quantity / order.total_quantity) * 100, 100)
                : 0;
              const isStarting = startingOrderId === order.id;
              const isCustomerOrder = Boolean(order.customer_id);

              return (
                <View key={order.id} style={[styles.orderCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                  <View style={styles.orderTopRow}>
                    <View>
                      <Text style={[styles.orderNumber, { color: colors.text.primary }]}>{order.order_number || 'Orden sin consecutivo'}</Text>
                      <Text style={[styles.orderType, { color: colors.text.secondary }]}>{isCustomerOrder ? 'Entrega a cliente' : 'Remisión interna'}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: colors.warning.main + '1A' }]}>
                      <Text style={[styles.statusText, { color: colors.warning.main }]}>{STATUS_LABELS[order.status] || order.status}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name={isCustomerOrder ? 'person-outline' : 'person-pin'} size={18} color={colors.text.secondary} />
                    <Text style={[styles.detailText, { color: colors.text.primary }]} numberOfLines={1}>
                      {order.customer_name || (isCustomerOrder ? 'Cliente sin nombre' : 'Usuario asignado')}
                    </Text>
                  </View>
                  {order.delivery_address ? (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="place" size={18} color={colors.text.secondary} />
                      <Text style={[styles.detailText, { color: colors.text.secondary }]} numberOfLines={1}>{order.delivery_address}</Text>
                    </View>
                  ) : null}

                  <View style={styles.progressHeader}>
                    <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>Pendiente por despachar</Text>
                    <Text style={[styles.progressQuantity, { color: colors.text.primary }]}>{formatQuantity(order.pending_quantity)} / {formatQuantity(order.total_quantity)}</Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.divider }]}>
                    <View style={[styles.progressValue, { width: `${progress}%`, backgroundColor: colors.success.main }]} />
                  </View>
                  <Text style={[styles.itemsText, { color: colors.text.secondary }]}>{order.total_items} {order.total_items === 1 ? 'producto' : 'productos'}</Text>

                  <TouchableOpacity
                    style={[styles.exitButton, { backgroundColor: colors.primary.main, opacity: isStarting ? 0.7 : 1 }]}
                    disabled={isStarting || order.pending_quantity <= 0}
                    onPress={() => openExit(order)}
                    activeOpacity={0.85}
                  >
                    {isStarting ? <ActivityIndicator color={colors.primary.contrastText} /> : <MaterialIcons name="local-shipping" size={19} color={colors.primary.contrastText} />}
                    <Text style={[styles.exitButtonText, { color: colors.primary.contrastText }]}>{isStarting ? 'Preparando…' : 'Registrar salida'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  headerIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 25, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 3 },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 13, height: 48, borderWidth: 1, borderRadius: 13, gap: 9 },
  searchInput: { flex: 1, fontSize: 14, height: '100%' },
  content: { padding: 20, paddingTop: 16, gap: 12, flexGrow: 1 },
  stateContainer: { flex: 1, minHeight: 220, justifyContent: 'center', alignItems: 'center', gap: 12 },
  stateText: { fontSize: 14 },
  messageCard: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center', gap: 10, marginTop: 30 },
  messageTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  messageText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  counter: { fontSize: 13, fontWeight: '600', marginBottom: -2 },
  orderCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
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
});
