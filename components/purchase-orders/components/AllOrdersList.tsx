import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { usePurchaseOrders } from '../infrastructure/hooks/usePurchaseOrders';
import { PurchaseOrderCard } from './PurchaseOrderCard';

interface AllOrdersListProps {
  searchQuery?: string;
}

export function AllOrdersList({ searchQuery = '' }: AllOrdersListProps) {
  const { purchaseOrders, loading, error } = usePurchaseOrders();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return purchaseOrders;
    const q = searchQuery.toLowerCase().trim();
    return purchaseOrders.filter((order) => {
      const fields = [
        order.order_number,
        (order as any).supplier?.name,
        order.status,
        order.notes,
        (order as any).created_by_profile?.full_name,
      ];
      return fields.some((field) => field && String(field).toLowerCase().includes(q));
    });
  }, [purchaseOrders, searchQuery]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary.main} />
        <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
          Cargando órdenes...
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

  if (purchaseOrders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="receipt-long" size={64} color={colors.text.secondary} />
        <Text style={[styles.emptyText, { color: colors.text.primary }]}>
          No hay órdenes registradas
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          Las órdenes de compra aparecerán aquí
        </Text>
      </View>
    );
  }

  if (filteredOrders.length === 0 && searchQuery.trim()) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="search-off" size={64} color={colors.text.secondary} />
        <Text style={[styles.emptyText, { color: colors.text.primary }]}>
          No se encontraron resultados
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          No hay órdenes de compra que coincidan con "{searchQuery}"
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {filteredOrders.map((order) => (
        <PurchaseOrderCard key={order.id} order={order} />
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



