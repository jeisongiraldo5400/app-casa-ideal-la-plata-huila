import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type DeliveryOrder = {
  id: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
  customer_id: string;
  customer_id_number: string;
  customer_name: string;
  delivery_address: string;
  notes: string | null;
  status: string;
  total_items: number;
  total_quantity: number;
  delivered_items: number;
  delivered_quantity: number;
  items: any;
};

export function AllDeliveryOrdersList() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDeliveryOrders();
  }, []);

  const loadDeliveryOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_delivery_orders_dashboard', {
        page: 1,
        page_size: 100,
        search_term: null,
      });

      if (rpcError) {
        console.error('Error loading delivery orders:', rpcError);
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      setDeliveryOrders(data || []);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading delivery orders:', err);
      setError(err.message || 'Error al cargar las órdenes de entrega');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return colors.success.main;
      case 'ready':
        return colors.info.main;
      case 'preparing':
        return colors.warning.main;
      case 'pending':
        return colors.warning.main;
      case 'cancelled':
        return colors.error.main;
      default:
        return colors.text.secondary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'Entregada';
      case 'ready':
        return 'Lista';
      case 'preparing':
        return 'Preparando';
      case 'pending':
        return 'Pendiente';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary.main} />
        <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
          Cargando órdenes de entrega...
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
          No hay órdenes de entrega registradas
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          Las órdenes de entrega aparecerán aquí
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {deliveryOrders.map((order) => {
        const statusColor = getStatusColor(order.status);
        const progress = order.total_quantity > 0 
          ? (order.delivered_quantity / order.total_quantity) * 100 
          : 0;

        return (
          <Card key={order.id} style={[styles.orderCard, { backgroundColor: colors.background.paper }]}>
            <View style={styles.orderHeader}>
              <View style={styles.orderHeaderLeft}>
                <Text style={[styles.orderId, { color: colors.text.primary }]}>
                  OE #{order.id.slice(0, 8)}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {getStatusLabel(order.status)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.orderDate, { color: colors.text.secondary }]}>
                {formatDate(order.created_at)}
              </Text>
            </View>

            <View style={styles.customerInfo}>
              <MaterialIcons name="person" size={16} color={colors.text.secondary} />
              <Text style={[styles.customerText, { color: colors.text.secondary }]}>
                {order.customer_name || 'Cliente sin nombre'}
              </Text>
            </View>

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
              {order.delivered_quantity > 0 && (
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { backgroundColor: colors.divider }]}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${progress}%`, 
                          backgroundColor: statusColor 
                        }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.progressText, { color: colors.text.secondary }]}>
                    {order.delivered_quantity} / {order.total_quantity} entregado{order.delivered_quantity !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
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
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  customerText: {
    fontSize: 14,
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
    marginBottom: 8,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'right',
  },
});

