import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
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
import { fetchReceivedDeliveryOrders } from '../infrastructure/services/receivedDeliveryOrdersService';
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
      // El servicio pide las órdenes y el perfil del creador a la vez y después
      // las líneas en lotes paralelos; aquí solo se pinta el resultado.
      setDeliveryOrders(await fetchReceivedDeliveryOrders(user.id));
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
