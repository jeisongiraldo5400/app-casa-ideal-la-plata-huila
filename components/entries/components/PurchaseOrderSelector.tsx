import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Card } from '@/components/ui/Card';
import { PurchaseOrderWithItems, useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Colors } from '@/constants/theme';

interface PurchaseOrderSelectorProps {
  purchaseOrders: PurchaseOrderWithItems[];
  selectedPurchaseOrderId: string | null;
  onSelect: (purchaseOrderId: string) => void;
}

export function PurchaseOrderSelector({
  purchaseOrders,
  selectedPurchaseOrderId,
  onSelect,
}: PurchaseOrderSelectorProps) {
  const { loadPurchaseOrderProgress } = useEntriesStore();
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
  const [loadingProgress, setLoadingProgress] = useState(false);

  // Cargar el progreso cuando se selecciona una orden
  useEffect(() => {
    if (selectedPurchaseOrderId) {
      setLoadingProgress(true);
      loadPurchaseOrderProgress(selectedPurchaseOrderId)
        .then((map) => {
          setProgressMap(map);
          setLoadingProgress(false);
        })
        .catch(() => {
          setLoadingProgress(false);
        });
    } else {
      setProgressMap(new Map());
    }
  }, [selectedPurchaseOrderId, loadPurchaseOrderProgress]);

  // Función para calcular el progreso de una orden de compra
  const calculateOrderProgress = (order: PurchaseOrderWithItems) => {
    const totalProducts = order.items.length;
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    // Si no hay progreso cargado o la orden no está seleccionada, retornar valores iniciales
    if (progressMap.size === 0 || selectedPurchaseOrderId !== order.id) {
      return {
        registeredProducts: 0,
        registeredQuantity: 0,
        totalProducts,
        totalQuantity,
        remainingProducts: totalProducts,
        remainingQuantity: totalQuantity,
      };
    }

    // Contar productos y cantidades registradas que están en la orden
    let registeredProducts = 0;
    let registeredQuantity = 0;

    order.items.forEach((orderItem) => {
      const registeredQty = progressMap.get(orderItem.product_id) || 0;
      if (registeredQty > 0) {
        registeredProducts++;
        // La cantidad registrada puede ser mayor que la orden si se registró más de una vez
        // Pero para el cálculo de "faltantes" usamos el mínimo
        registeredQuantity += Math.min(registeredQty, orderItem.quantity);
      }
    });

    return {
      registeredProducts,
      registeredQuantity,
      totalProducts,
      totalQuantity,
      remainingProducts: totalProducts - registeredProducts,
      remainingQuantity: totalQuantity - registeredQuantity,
    };
  };
  if (purchaseOrders.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyText}>
          No hay órdenes de compra pendientes o en proceso para este proveedor
        </Text>
      </Card>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Sin fecha';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Fecha inválida';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDIENTE':
        return Colors.warning.main;
      case 'EN PROCESO':
        return Colors.info.main;
      default:
        return Colors.text.secondary;
    }
  };

  return (
    <ScrollView style={styles.container}>
      {purchaseOrders.map((order) => {
        const isSelected = selectedPurchaseOrderId === order.id;
        const progress = calculateOrderProgress(order);
        const progressPercentage = progress.totalProducts > 0 
          ? Math.round((progress.registeredProducts / progress.totalProducts) * 100) 
          : 0;

        return (
          <TouchableOpacity
            key={order.id}
            onPress={() => onSelect(order.id)}
            activeOpacity={0.7}>
            <Card
              style={[
                styles.orderCard,
                isSelected && styles.selectedOrderCard,
              ]}>
              <View style={styles.orderHeader}>
                <View style={styles.orderHeaderLeft}>
                  <Text style={styles.orderId}>OC #{order.id.slice(0, 8)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
                    <Text style={styles.statusText}>{order.status}</Text>
                  </View>
                </View>
                <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
              </View>

              {order.notes && (
                <Text style={styles.orderNotes} numberOfLines={2}>
                  {order.notes}
                </Text>
              )}

              <View style={styles.orderSummary}>
                <Text style={styles.summaryText}>
                  {progress.totalProducts} producto{progress.totalProducts !== 1 ? 's' : ''} • {progress.totalQuantity} unidad{progress.totalQuantity !== 1 ? 'es' : ''}
                </Text>
              </View>

              {/* Progreso de productos registrados */}
              {isSelected && (
                <View style={styles.progressContainer}>
                  {loadingProgress ? (
                    <Text style={styles.loadingProgressText}>Cargando progreso...</Text>
                  ) : (
                    <>
                      <View style={styles.progressHeader}>
                        <Text style={styles.progressTitle}>Progreso de registro:</Text>
                        <Text style={styles.progressPercentage}>{progressPercentage}%</Text>
                      </View>
                      <View style={styles.progressBarContainer}>
                        <View 
                          style={[
                            styles.progressBar, 
                            { width: `${progressPercentage}%` }
                          ]} 
                        />
                      </View>
                      <View style={styles.progressDetails}>
                        <Text style={styles.progressText}>
                          <Text style={styles.progressBold}>{progress.registeredProducts}</Text> de <Text style={styles.progressBold}>{progress.totalProducts}</Text> productos registrados
                        </Text>
                        <Text style={styles.progressText}>
                          <Text style={styles.progressBold}>{progress.registeredQuantity}</Text> de <Text style={styles.progressBold}>{progress.totalQuantity}</Text> unidades registradas
                        </Text>
                        {progress.remainingProducts > 0 && (
                          <Text style={styles.remainingText}>
                            Faltan: <Text style={styles.remainingBold}>{progress.remainingProducts}</Text> producto{progress.remainingProducts !== 1 ? 's' : ''} ({progress.remainingQuantity} unidad{progress.remainingQuantity !== 1 ? 'es' : ''})
                          </Text>
                        )}
                        {progress.remainingProducts === 0 && progress.registeredProducts > 0 && (
                          <Text style={styles.completeText}>
                            ✓ Todos los productos de la orden han sido registrados
                          </Text>
                        )}
                      </View>
                    </>
                  )}
                </View>
              )}

              <View style={styles.productsList}>
                <Text style={styles.productsListTitle}>Productos incluidos:</Text>
                {order.items.slice(0, 3).map((item, index) => (
                  <View key={item.id} style={styles.productItem}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.product?.name || 'Producto sin nombre'}
                    </Text>
                    <Text style={styles.productQuantity}>Cantidad: {item.quantity}</Text>
                  </View>
                ))}
                {order.items.length > 3 && (
                  <Text style={styles.moreProducts}>
                    +{order.items.length - 3} producto{order.items.length - 3 !== 1 ? 's' : ''} más
                  </Text>
                )}
              </View>

              {isSelected && (
                <View style={styles.selectedIndicator}>
                  <Text style={styles.selectedText}>✓ Seleccionada</Text>
                </View>
              )}
            </Card>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  orderCard: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.divider,
  },
  selectedOrderCard: {
    borderColor: Colors.primary.main,
    backgroundColor: Colors.primary.light,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  orderHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  orderDate: {
    fontSize: 12,
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
  selectedIndicator: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.primary.main,
    alignItems: 'center',
  },
  selectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary.main,
  },
  progressContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary.main,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: Colors.background.default,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary.main,
    borderRadius: 4,
  },
  progressDetails: {
    gap: 4,
  },
  progressText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  progressBold: {
    fontWeight: '600',
    color: Colors.text.primary,
  },
  remainingText: {
    fontSize: 13,
    color: Colors.warning.main,
    marginTop: 4,
    fontWeight: '500',
  },
  remainingBold: {
    fontWeight: '700',
  },
  completeText: {
    fontSize: 13,
    color: Colors.success.main,
    marginTop: 4,
    fontWeight: '600',
  },
  loadingProgressText: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

