import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { usePurchaseOrders } from '../infrastructure/hooks/usePurchaseOrders';

export function ReceivedOrdersList() {
  const { purchaseOrders, loading, error } = usePurchaseOrders();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

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
        <Text style={[styles.loadingText, { color: colors.text.secondary }]}>Cargando órdenes recibidas...</Text>
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
        <Text style={[styles.emptyText, { color: colors.text.primary }]}>No hay órdenes recibidas</Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          Las órdenes que marques como recibidas aparecerán aquí
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {purchaseOrders.map((order) => {
        const totalItems = order.items?.length || 0;
        const totalQuantity = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

        return (
          <Card key={order.id} style={[styles.orderCard, { backgroundColor: colors.background.paper }]}>
            <View style={styles.orderHeader}>
              <View style={styles.orderHeaderLeft}>
                <Text style={[styles.orderId, { color: colors.text.primary }]}>OC #{order.order_number || order.id.slice(0, 8)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: colors.success.main }]}>
                  <Text style={styles.statusText}>Recibida</Text>
                </View>
              </View>
              <Text style={[styles.orderDate, { color: colors.text.secondary }]}>{formatDate(order.updated_at || order.created_at)}</Text>
            </View>

            {order.supplier && (
              <View style={styles.supplierInfo}>
                <MaterialIcons name="local-shipping" size={16} color={colors.text.secondary} />
                <Text style={[styles.supplierText, { color: colors.text.secondary }]}>
                  {order.supplier.name || 'Proveedor sin nombre'}
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
                {totalItems} producto{totalItems !== 1 ? 's' : ''} • {totalQuantity} unidad{totalQuantity !== 1 ? 'es' : ''}
              </Text>
            </View>

            {order.items && order.items.length > 0 && (
              <View style={styles.productsList}>
                <Text style={[styles.productsListTitle, { color: colors.text.primary }]}>Productos:</Text>
                {order.items.slice(0, 5).map((item) => (
                  <View key={item.id} style={[styles.productItem, { backgroundColor: colors.background.default }]}>
                    <Text style={[styles.productName, { color: colors.text.primary }]} numberOfLines={1}>
                      {item.product?.name || 'Producto sin nombre'}
                    </Text>
                    <Text style={[styles.productQuantity, { color: colors.text.secondary }]}>
                      {item.quantity} unidad{item.quantity !== 1 ? 'es' : ''}
                    </Text>
                  </View>
                ))}
                {order.items.length > 5 && (
                  <Text style={[styles.moreProducts, { color: colors.text.secondary }]}>
                    +{order.items.length - 5} producto{order.items.length - 5 !== 1 ? 's' : ''} más
                  </Text>
                )}
              </View>
            )}

            <View style={[styles.receivedBadge, { backgroundColor: colors.success.main + '15' }]}>
              <MaterialIcons name="check-circle" size={20} color={colors.success.main} />
              <Text style={[styles.receivedText, { color: colors.success.main }]}>
                Recibida el {formatDate(order.updated_at || order.created_at)}
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
    color: '#ffffff',
  },
  orderDate: {
    fontSize: 12,
  },
  supplierInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  supplierText: {
    fontSize: 14,
  },
  orderNotes: {
    fontSize: 14,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  orderSummary: {
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  productsList: {
    marginTop: 8,
  },
  productsListTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  productName: {
    flex: 1,
    fontSize: 13,
    marginRight: 8,
  },
  productQuantity: {
    fontSize: 13,
    fontWeight: '500',
  },
  moreProducts: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
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

