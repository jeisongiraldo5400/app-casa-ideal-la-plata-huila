import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
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
import { DeliveryOrder } from '../types';
import { DeliveryOrderCard } from './DeliveryOrderCard';

export function ReceivedDeliveryOrdersList() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadReceivedDeliveryOrders();
    }
  }, [user]);

  const loadReceivedDeliveryOrders = async () => {
    if (!user) {
      setError('Usuario no autenticado');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Consultar directamente la tabla para obtener información completa de cliente y usuario
      // Filtrar órdenes eliminadas, creadas por el usuario logueado y con estados completados o aprobados
      // Filtrar por created_by para mostrar solo las órdenes que el usuario logueado registró
      // Incluir estados: delivered, approved, received (todas las completadas o aprobadas)
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
        .eq('created_by', user.id) // Solo órdenes creadas por el usuario logueado
        .in('status', ['delivered', 'approved', 'received']) // Todas las órdenes completadas o aprobadas
        .order('created_at', { ascending: false })
        .limit(100); // Limitar a 100 órdenes para mejorar rendimiento

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
        // Cargar items de todas las órdenes en lotes para evitar límites de Supabase
        // Supabase tiene un límite de ~1000 elementos en .in(), así que dividimos en lotes de 500
        const BATCH_SIZE = 500;
        let allItemsData: any[] = [];
        
        for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
          const batch = orderIds.slice(i, i + BATCH_SIZE);
          const { data: itemsData, error: itemsError } = await supabase
            .from('delivery_order_items')
            .select('delivery_order_id, quantity, delivered_quantity')
            .in('delivery_order_id', batch)
            .is('deleted_at', null);
          
          if (itemsError) {
            console.error('Error loading delivery order items batch:', itemsError);
          } else {
            allItemsData = [...allItemsData, ...(itemsData || [])];
          }
        }
        
        const itemsData = allItemsData;

        // Calcular estadísticas por orden
        if (itemsData.length > 0) {
          const statsByOrder = new Map<string, {
            total_items: number;
            total_quantity: number;
            delivered_items: number;
            delivered_quantity: number;
          }>();

          itemsData.forEach((item: any) => {
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
        } else {
          // Si no hay items, crear órdenes sin estadísticas
          ordersWithStats = (ordersData || []).map((order: any) => {
            const createdByProfile = createdByProfilesMap.get(order.created_by);
            return {
              ...order,
              total_items: 0,
              total_quantity: 0,
              delivered_items: 0,
              delivered_quantity: 0,
              created_by_profile: createdByProfile || null,
            };
          });
        }
      } else {
        // Si no hay orderIds, crear órdenes sin estadísticas
        ordersWithStats = (ordersData || []).map((order: any) => {
          const createdByProfile = createdByProfilesMap.get(order.created_by);
          return {
            ...order,
            total_items: 0,
            total_quantity: 0,
            delivered_items: 0,
            delivered_quantity: 0,
            created_by_profile: createdByProfile || null,
          };
        });
      }

      // Las órdenes ya están filtradas por estado "delivered" o "approved" en la consulta
      // Transformar al formato esperado
      const completedOrders = ordersWithStats.map((order: any) => ({
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
      {deliveryOrders.map((order) => (
        <DeliveryOrderCard key={order.id} order={order} showCreatedBy={false} />
      ))}
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
});
