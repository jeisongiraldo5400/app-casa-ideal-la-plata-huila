import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type DeliveryOrder = {
  id: string;
  order_number: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string;
  customer_id: string | null;
  customer_id_number: string | null;
  customer_name: string | null;
  assigned_to_user_id: string | null;
  assigned_to_user_name: string | null;
  assigned_to_user_email: string | null;
  order_type: string;
  delivery_address: string | null;
  notes: string | null;
  status: string;
  total_items: number;
  total_quantity: number;
  delivered_items: number;
  delivered_quantity: number;
  items: any;
};

export function ReceivedDeliveryOrdersList() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReceivedDeliveryOrders();
  }, []);

  const loadReceivedDeliveryOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      // Consultar directamente la tabla para obtener información completa de cliente y usuario
      // Filtrar órdenes eliminadas (solo delivery_orders tiene deleted_at, no delivery_order_items)
      const { data: ordersData, error: ordersError } = await supabase
        .from('delivery_orders')
        .select(`
          id,
          created_at,
          created_by,
          customer_id,
          assigned_to_user_id,
          order_type,
          delivery_address,
          notes,
          status,
          order_number,
          customer:customers(id, name, id_number),
          assigned_to_user:profiles(id, full_name, email)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error loading delivery orders:', ordersError);
        setError(ordersError.message);
        setLoading(false);
        return;
      }

      // Cargar perfiles de los creadores por separado (ya que no hay foreign key directa)
      const createdByUserIds = [...new Set((ordersData || []).map((order: any) => order.created_by).filter(Boolean))];
      let createdByProfilesMap = new Map();
      
      if (createdByUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', createdByUserIds);
        
        createdByProfilesMap = new Map(
          (profilesData || []).map((profile) => [profile.id, profile])
        );
      }

      // Calcular estadísticas manualmente para incluir todas las órdenes (clientes y remisiones)
      const orderIds = (ordersData || []).map((order: any) => order.id);
      
      let ordersWithStats: any[] = [];
      if (orderIds.length > 0) {
        // Cargar items de todas las órdenes
        // Nota: delivery_order_items NO tiene columna deleted_at según las migraciones
        const { data: itemsData, error: itemsError } = await supabase
          .from('delivery_order_items')
          .select('delivery_order_id, quantity, delivered_quantity')
          .in('delivery_order_id', orderIds);

        if (itemsError) {
          console.error('Error loading delivery order items:', itemsError);
        } else {
          // Calcular estadísticas por orden
          const statsByOrder = new Map<string, {
            total_items: number;
            total_quantity: number;
            delivered_items: number;
            delivered_quantity: number;
          }>();

          (itemsData || []).forEach((item: any) => {
            const orderId = item.delivery_order_id;
            if (!statsByOrder.has(orderId)) {
              statsByOrder.set(orderId, {
                total_items: 0,
                total_quantity: 0,
                delivered_items: 0,
                delivered_quantity: 0,
              });
            }
            const stats = statsByOrder.get(orderId)!;
            stats.total_items += 1;
            stats.total_quantity += item.quantity || 0;
            if (item.delivered_quantity > 0) {
              stats.delivered_items += 1;
            }
            stats.delivered_quantity += item.delivered_quantity || 0;
          });

          // Combinar datos de órdenes con estadísticas
          ordersWithStats = (ordersData || []).map((order: any) => {
            const stats = statsByOrder.get(order.id) || {
              total_items: 0,
              total_quantity: 0,
              delivered_items: 0,
              delivered_quantity: 0,
            };
            const createdByProfile = createdByProfilesMap.get(order.created_by);
            return {
              ...order,
              total_items: stats.total_items,
              total_quantity: stats.total_quantity,
              delivered_items: stats.delivered_items,
              delivered_quantity: stats.delivered_quantity,
              created_by_profile: createdByProfile || null,
            };
          });
        }
      }

      // Filtrar solo las órdenes completadas (todas las unidades entregadas)
      // Una orden está completa cuando delivered_quantity >= total_quantity
      const completedOrders = ordersWithStats
        .filter((order: any) => 
          order.total_quantity > 0 && order.delivered_quantity >= order.total_quantity
        )
        .map((order: any) => ({
          id: order.id,
          order_number: order.order_number,
          created_at: order.created_at,
          created_by: order.created_by,
          created_by_name: order.created_by_profile?.full_name || order.created_by_profile?.email || 'Usuario desconocido',
          customer_id: order.customer_id,
          customer_id_number: order.customer?.id_number || null,
          customer_name: order.customer?.name || null,
          assigned_to_user_id: order.assigned_to_user_id,
          assigned_to_user_name: order.assigned_to_user?.full_name || null,
          assigned_to_user_email: order.assigned_to_user?.email || null,
          order_type: order.order_type,
          delivery_address: order.delivery_address,
          notes: order.notes,
          status: order.status,
          total_items: order.total_items,
          total_quantity: order.total_quantity,
          delivered_items: order.delivered_items,
          delivered_quantity: order.delivered_quantity,
          items: [],
        }));

      setDeliveryOrders(completedOrders);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading delivery orders:', err);
      setError(err.message || 'Error al cargar las órdenes de entrega completadas');
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Sin fecha';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Fecha inválida';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary.main} />
        <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
          Cargando órdenes de entrega completadas...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.error.main} />
        <Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text>
      </View>
    );
  }

  if (deliveryOrders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="local-shipping" size={64} color={colors.text.secondary} />
        <Text style={[styles.emptyText, { color: colors.text.primary }]}>
          No hay órdenes de entrega completadas
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          Las órdenes de entrega completas (todas las unidades entregadas) aparecerán aquí
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {deliveryOrders.map((order) => {
        return (
          <Card key={order.id} style={[styles.orderCard, { backgroundColor: colors.background.paper }]}>
            <View style={styles.orderHeader}>
              <View style={styles.orderHeaderLeft}>
                <Text style={[styles.orderId, { color: colors.text.primary }]}>
                  OE #{order.order_number || order.id.slice(0, 8)}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: colors.success.main + '20' }]}>
                  <Text style={[styles.statusText, { color: colors.success.main }]}>
                    Entregada
                  </Text>
                </View>
              </View>
              <Text style={[styles.orderDate, { color: colors.text.secondary }]}>
                {formatDate(order.created_at)}
              </Text>
            </View>

            {/* Mostrar destinatario: Cliente o Usuario (Remisión) */}
            {order.customer_id ? (
              <View style={styles.recipientInfo}>
                <MaterialIcons name="person" size={16} color={colors.text.secondary} />
                <View style={styles.recipientContent}>
                  <Text style={[styles.recipientLabel, { color: colors.text.secondary }]}>Cliente:</Text>
                  <Text style={[styles.recipientText, { color: colors.text.primary }]}>
                    {order.customer_name || 'Cliente sin nombre'}
                  </Text>
                  {order.customer_id_number && (
                    <Text style={[styles.recipientSubtext, { color: colors.text.secondary }]}>
                      NIT/CC: {order.customer_id_number}
                    </Text>
                  )}
                </View>
              </View>
            ) : order.assigned_to_user_id ? (
              <View style={styles.recipientInfo}>
                <MaterialIcons name="account-circle" size={16} color={colors.text.secondary} />
                <View style={styles.recipientContent}>
                  <Text style={[styles.recipientLabel, { color: colors.text.secondary }]}>Remisión a:</Text>
                  <Text style={[styles.recipientText, { color: colors.text.primary }]}>
                    {order.assigned_to_user_name || order.assigned_to_user_email || 'Usuario sin nombre'}
                  </Text>
                  {order.assigned_to_user_email && order.assigned_to_user_name && (
                    <Text style={[styles.recipientSubtext, { color: colors.text.secondary }]}>
                      {order.assigned_to_user_email}
                    </Text>
                  )}
                </View>
              </View>
            ) : null}

            {order.delivery_address && (
              <View style={styles.addressInfo}>
                <MaterialIcons name="location-on" size={16} color={colors.text.secondary} />
                <Text style={[styles.addressText, { color: colors.text.secondary }]} numberOfLines={2}>
                  {order.delivery_address}
                </Text>
              </View>
            )}

            {order.created_by_name && (
              <View style={styles.creatorInfo}>
                <MaterialIcons name="person-outline" size={16} color={colors.text.secondary} />
                <Text style={[styles.creatorText, { color: colors.text.secondary }]}>
                  Creada por: {order.created_by_name}
                </Text>
              </View>
            )}

            {order.notes && (
              <Text style={[styles.orderNotes, { color: colors.text.secondary }]} numberOfLines={2}>
                {order.notes}
              </Text>
            )}

            <View style={[styles.orderSummary, { borderTopColor: colors.divider }]}>
              <Text style={[styles.summaryText, { color: colors.text.primary }]}>
                {order.total_items} producto{order.total_items !== 1 ? 's' : ''} • {order.total_quantity} unidad{order.total_quantity !== 1 ? 'es' : ''}
              </Text>
            </View>

            <View style={[styles.receivedBadge, { backgroundColor: colors.success.main + '15' }]}>
              <MaterialIcons name="check-circle" size={20} color={colors.success.main} />
              <Text style={[styles.receivedText, { color: colors.success.main }]}>
                Entregada completamente
              </Text>
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  orderCard: {
    marginBottom: 16,
    padding: 16,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderDate: {
    fontSize: 12,
  },
  recipientInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  recipientContent: {
    flex: 1,
  },
  recipientLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  recipientText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recipientSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  addressInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  addressText: {
    fontSize: 14,
    flex: 1,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  creatorText: {
    fontSize: 14,
  },
  orderNotes: {
    fontSize: 14,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  orderSummary: {
    marginTop: 8,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  receivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  receivedText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
