import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { usePurchaseOrders } from '../infrastructure/hooks/usePurchaseOrders';

export function ReceivedOrdersList() {
  const { purchaseOrders, loading, error } = usePurchaseOrders();

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
        <ActivityIndicator size="large" color={Colors.primary.main} />
        <Text style={styles.loadingText}>Cargando órdenes recibidas...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={Colors.error.main} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (purchaseOrders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="receipt-long" size={64} color={Colors.text.secondary} />
        <Text style={styles.emptyText}>No hay órdenes recibidas</Text>
        <Text style={styles.emptySubtext}>
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
          <Card key={order.id} style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <View style={styles.orderHeaderLeft}>
                <Text style={styles.orderId}>OC #{order.id.slice(0, 8)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: Colors.success.main }]}>
                  <Text style={styles.statusText}>Recibida</Text>
                </View>
              </View>
              <Text style={styles.orderDate}>{formatDate(order.updated_at || order.created_at)}</Text>
            </View>

            {order.supplier && (
              <View style={styles.supplierInfo}>
                <MaterialIcons name="local-shipping" size={16} color={Colors.text.secondary} />
                <Text style={styles.supplierText}>
                  {order.supplier.name || 'Proveedor sin nombre'}
                </Text>
              </View>
            )}

            {order.notes && (
              <Text style={styles.orderNotes} numberOfLines={2}>
                {order.notes}
              </Text>
            )}

            <View style={styles.orderSummary}>
              <Text style={styles.summaryText}>
                {totalItems} producto{totalItems !== 1 ? 's' : ''} • {totalQuantity} unidad{totalQuantity !== 1 ? 'es' : ''}
              </Text>
            </View>

            {order.items && order.items.length > 0 && (
              <View style={styles.productsList}>
                <Text style={styles.productsListTitle}>Productos:</Text>
                {order.items.slice(0, 5).map((item) => (
                  <View key={item.id} style={styles.productItem}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.product?.name || 'Producto sin nombre'}
                    </Text>
                    <Text style={styles.productQuantity}>
                      {item.quantity} unidad{item.quantity !== 1 ? 'es' : ''}
                    </Text>
                  </View>
                ))}
                {order.items.length > 5 && (
                  <Text style={styles.moreProducts}>
                    +{order.items.length - 5} producto{order.items.length - 5 !== 1 ? 's' : ''} más
                  </Text>
                )}
              </View>
            )}

            <View style={styles.receivedBadge}>
              <MaterialIcons name="check-circle" size={20} color={Colors.success.main} />
              <Text style={styles.receivedText}>
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
    color: Colors.text.secondary,
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
    color: Colors.error.main,
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
    color: Colors.text.primary,
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.text.secondary,
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
    color: Colors.text.primary,
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
    color: Colors.text.secondary,
  },
  supplierInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  supplierText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  orderNotes: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  orderSummary: {
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  productsList: {
    marginTop: 8,
  },
  productsListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.background.default,
    borderRadius: 4,
    marginBottom: 4,
  },
  productName: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.primary,
    marginRight: 8,
  },
  productQuantity: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  moreProducts: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  receivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success.main + '15',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  receivedText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.success.main,
  },
});

