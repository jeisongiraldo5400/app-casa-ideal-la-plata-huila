import React from "react";

import {
  PurchaseOrderWithItems,
  useEntriesStore,
} from "@/components/entries/infrastructure/store/entriesStore";

import { Card } from "@/components/ui/Card";
import { Colors } from "@/constants/theme";

import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
  const { purchaseOrderValidations } = useEntriesStore();

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
    if (!dateString) return "Sin fecha";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Fecha inválida";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDIENTE":
        return Colors.warning.main;
      case "EN PROCESO":
        return Colors.info.main;
      default:
        return Colors.text.secondary;
    }
  };

  return (
    <ScrollView style={styles.container}>
      {purchaseOrders.map((order) => {
        const isSelected = selectedPurchaseOrderId === order.id;
        const totalProducts = order.items.length;
        const totalQuantity = order.items.reduce(
          (sum, item) => sum + item.quantity,
          0
        );

        // Obtener los datos de validación para esta orden específica
        const validation = purchaseOrderValidations[order.id];
        const isComplete = validation?.isComplete || false;
        const totalQuantityOfInventoryEntries = validation?.totalQuantityOfInventoryEntries || 0;
        const totalItemsQuantity = validation?.totalItemsQuantity || totalQuantity;

        // Determinar si la orden está completa y no se puede seleccionar
        const isOrderComplete = isComplete && totalQuantityOfInventoryEntries >= totalItemsQuantity && totalItemsQuantity > 0;

        return (
          <TouchableOpacity
            key={order.id}
            onPress={() => {
              if (!isOrderComplete) {
                onSelect(order.id);
              }
            }}
            activeOpacity={isOrderComplete ? 1 : 0.7}
            disabled={isOrderComplete}
          >
            <Card
              style={[
                styles.orderCard,
                ...(isSelected ? [styles.selectedOrderCard] : []),
                ...(isOrderComplete ? [styles.completeOrderCard] : []),
              ]}
            >
              <View style={styles.orderHeader}>
                <View style={styles.orderHeaderLeft}>
                  <Text style={styles.orderId}>OC #{order.id.slice(0, 8)}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(order.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>{order.status}</Text>
                  </View>
                  {isComplete ? (
                    <View style={styles.completePurchaseOrderCard}>
                      <Text style={styles.completePurchaseOrderText}>✓</Text>
                    </View>
                  ) : (
                    <View style={styles.incompletePurchaseOrderCard}>
                      <Text style={styles.incompletePurchaseOrderText}>✗</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.orderDate}>
                  {formatDate(order.created_at)}
                </Text>
              </View>

              {order.notes && (
                <Text style={styles.orderNotes} numberOfLines={2}>
                  {order.notes}
                </Text>
              )}

              <View style={styles.orderSummary}>
                <Text style={styles.summaryText}>
                  {totalProducts} producto{totalProducts !== 1 ? "s" : ""} •{" "}
                  {totalQuantity} unidad{totalQuantity !== 1 ? "es" : ""}
                </Text>
              </View>

              <View style={styles.orderSummary}>
                <Text style={styles.summaryText}>
                  {totalQuantityOfInventoryEntries} unidad
                  {totalQuantityOfInventoryEntries !== 1 ? "es" : ""} escaneadas
                </Text>
                <Text style={styles.summaryText}>
                  {totalItemsQuantity} unidad
                  {totalItemsQuantity !== 1 ? "es" : ""} en la orden
                </Text>
              </View>

              {isOrderComplete && (
                <View style={styles.completeMessageContainer}>
                  <Text style={styles.completeMessageText}>
                    ✓ Orden completa - No se pueden escanear más productos
                  </Text>
                </View>
              )}

              <View style={styles.productsList}>
                <Text style={styles.productsListTitle}>
                  Productos incluidos:
                </Text>
                {order.items.slice(0, 3).map((item, index) => (
                  <View key={item.id} style={styles.productItem}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.product?.name || "Producto sin nombre"}
                    </Text>
                    <Text style={styles.productQuantity}>
                      Cantidad: {item.quantity}
                    </Text>
                  </View>
                ))}
                {order.items.length > 3 && (
                  <Text style={styles.moreProducts}>
                    +{order.items.length - 3} producto
                    {order.items.length - 3 !== 1 ? "s" : ""} más
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
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: "center",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  orderHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  orderDate: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  orderNotes: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 8,
    fontStyle: "italic",
  },
  orderSummary: {
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.text.primary,
  },
  productsList: {
    marginTop: 8,
  },
  productsListTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text.primary,
    marginBottom: 8,
  },
  productItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    fontWeight: "500",
    color: Colors.text.secondary,
  },
  moreProducts: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontStyle: "italic",
    marginTop: 4,
  },
  selectedIndicator: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.primary.main,
    alignItems: "center",
  },
  selectedText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.primary.main,
  },
  completePurchaseOrderCard: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.success.main,
  },
  completePurchaseOrderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  incompletePurchaseOrderCard: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.error.main,
  },
  incompletePurchaseOrderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  completeOrderCard: {
    opacity: 0.7,
    backgroundColor: Colors.success.light + "20",
  },
  completeMessageContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.success.light + "30",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.success.main,
  },
  completeMessageText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.success.main,
    textAlign: "center",
  },
});
