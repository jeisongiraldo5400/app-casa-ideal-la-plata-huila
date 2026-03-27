import React from "react";

import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

import { MaterialIcons } from "@expo/vector-icons";

// UI
import { Card } from "@/components/ui/Card";
import { getColors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// Hooks
import { useUserRoles } from "@/hooks/useUserRoles";

// Store
import {
    PurchaseOrderWithItems,
    useEntriesStore,
} from "@/components/entries/infrastructure/store/entriesStore";
import { usePurchaseOrders } from "@/components/purchase-orders";

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

  // Stores
  const { purchaseOrderValidations, loadPurchaseOrders: loadEntriesPurchaseOrders } = useEntriesStore();
  const { markOrderAsReceived, validateOrderIsComplete } = usePurchaseOrders();

  // Hooks
  const { canMarkOrderAsReceived } = useUserRoles();
  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');

  if (purchaseOrders.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={[styles.emptyText, { color: Colors.text.secondary }]}>
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
      case "pending":
        return Colors.warning.main;
      case "approved":
        return Colors.info.main;
      case "received":
        return Colors.success.main;
      default:
        return Colors.text.secondary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Pendiente";
      case "approved":
        return "Aprobada";
      case "received":
        return "Recibida";
      default:
        return status;
    }
  };

  const handleMarkAsReceived = async (orderId: string) => {
    if (!canMarkOrderAsReceived()) {
      Alert.alert(
        'Sin permisos',
        'Solo los usuarios con rol de administrador o bodeguero pueden marcar órdenes como recibidas.'
      );
      return;
    }

    Alert.alert(
      'Confirmar',
      '¿Está seguro de que desea marcar esta orden como recibida? Se validará que todas las unidades estén registradas.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Confirmar',
          onPress: async () => {
            const validation = await validateOrderIsComplete(orderId);

            if (!validation.isComplete) {
              let message = validation.error || 'La orden no está completa.\n\n';
              if (validation.details?.missingItems && validation.details.missingItems.length > 0) {
                message += 'Productos faltantes:\n';
                validation.details.missingItems.forEach((item) => {
                  message += `- Faltan ${item.missing} unidades del producto ${item.product_id.slice(0, 8)}\n`;
                });
              }
              Alert.alert('Orden incompleta', message);
              return;
            }

            const result = await markOrderAsReceived(orderId);

            if (result.success) {
              Alert.alert('Éxito', 'La orden ha sido marcada como recibida.');
              // Recargar las órdenes del proveedor actual
              const currentSupplierId = purchaseOrders[0]?.supplier_id;
              if (currentSupplierId) {
                loadEntriesPurchaseOrders(currentSupplierId);
              }
            } else {
              Alert.alert('Error', result.error || 'No se pudo marcar la orden como recibida.');
            }
          },
        },
      ]
    );
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
                { borderColor: Colors.divider },
                ...(isSelected ? [{ borderColor: Colors.primary.main, backgroundColor: Colors.primary.light }] : []),
                ...(isOrderComplete ? [{ opacity: 0.7, backgroundColor: Colors.success.light + "20" }] : []),
              ]}
            >
              <View style={styles.orderHeader}>
                <View style={styles.orderHeaderLeft}>
                  <Text style={[styles.orderId, { color: Colors.text.primary }]}>OC #{order.order_number || order.id.slice(0, 8)}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(order.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>{getStatusLabel(order.status)}</Text>
                  </View>
                  {isComplete ? (
                    <View style={[styles.completePurchaseOrderCard, { backgroundColor: Colors.success.main }]}>
                      <Text style={styles.completePurchaseOrderText}>✓</Text>
                    </View>
                  ) : (
                    <View style={[styles.incompletePurchaseOrderCard, { backgroundColor: Colors.error.main }]}>
                      <Text style={styles.incompletePurchaseOrderText}>✗</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.orderDate, { color: Colors.text.secondary }]}>
                  {formatDate(order.created_at)}
                </Text>
              </View>

              {order.notes && (
                <Text style={[styles.orderNotes, { color: Colors.text.secondary }]} numberOfLines={2}>
                  {order.notes}
                </Text>
              )}

              <View style={[styles.orderSummary, { borderTopColor: Colors.divider }]}>
                <Text style={[styles.summaryText, { color: Colors.text.primary }]}>
                  {totalProducts} producto{totalProducts !== 1 ? "s" : ""} •{" "}
                  {totalQuantity} unidad{totalQuantity !== 1 ? "es" : ""}
                </Text>
              </View>

              <View style={[styles.orderSummary, { borderTopColor: Colors.divider }]}>
                <Text style={[styles.summaryText, { color: Colors.text.primary }]}>
                  {totalQuantityOfInventoryEntries} unidad
                  {totalQuantityOfInventoryEntries !== 1 ? "es" : ""} ya registradas
                </Text>
                <Text style={[styles.summaryText, { color: Colors.text.primary }]}>
                  {totalItemsQuantity} unidad
                  {totalItemsQuantity !== 1 ? "es" : ""} en la orden
                </Text>
              </View>

              {isOrderComplete && order.status !== 'received' && (
                <View style={[styles.completeMessageContainer, {
                  backgroundColor: Colors.success.light + "30",
                  borderColor: Colors.success.main
                }]}>
                  <Text style={[styles.completeMessageText, { color: Colors.success.main }]}>
                    ✓ Orden completa - No se pueden escanear más productos
                  </Text>
                  {canMarkOrderAsReceived() && (
                    <TouchableOpacity
                      style={[styles.markReceivedButton, { backgroundColor: Colors.success.main + "15" }]}
                      onPress={() => handleMarkAsReceived(order.id)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="check-circle" size={20} color={Colors.success.main} />
                      <Text style={[styles.markReceivedButtonText, { color: Colors.success.main }]}>Marcar como recibida</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {order.status === 'received' && (
                <View style={[styles.receivedBadge, { backgroundColor: Colors.success.main + "15" }]}>
                  <MaterialIcons name="check-circle" size={20} color={Colors.success.main} />
                  <Text style={[styles.receivedText, { color: Colors.success.main }]}>Orden recibida</Text>
                </View>
              )}

              <View style={styles.productsList}>
                <Text style={[styles.productsListTitle, { color: Colors.text.primary }]}>
                  Productos incluidos:
                </Text>
                {order.items.slice(0, 3).map((item, index) => (
                  <View key={item.id} style={[styles.productItem, { backgroundColor: Colors.background.default }]}>
                    <Text style={[styles.productName, { color: Colors.text.primary }]} numberOfLines={1}>
                      {item.product?.name || "Producto sin nombre"}
                    </Text>
                    <Text style={[styles.productQuantity, { color: Colors.text.secondary }]}>
                      Cantidad: {item.quantity}
                    </Text>
                  </View>
                ))}
                {order.items.length > 3 && (
                  <Text style={[styles.moreProducts, { color: Colors.text.secondary }]}>
                    +{order.items.length - 3} producto
                    {order.items.length - 3 !== 1 ? "s" : ""} más
                  </Text>
                )}
              </View>

              {isSelected && (
                <View style={[styles.selectedIndicator, { borderTopColor: Colors.primary.main }]}>
                  <Text style={[styles.selectedText, { color: Colors.primary.main }]}>✓ Seleccionada</Text>
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
    textAlign: "center",
  },
  orderCard: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 2,
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
  },
  orderNotes: {
    fontSize: 14,
    marginBottom: 8,
    fontStyle: "italic",
  },
  orderSummary: {
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: "500",
  },
  productsList: {
    marginTop: 8,
  },
  productsListTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  productItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    fontWeight: "500",
  },
  moreProducts: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
  selectedIndicator: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    alignItems: "center",
  },
  selectedText: {
    fontSize: 14,
    fontWeight: "600",
  },
  completePurchaseOrderCard: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
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
  },
  incompletePurchaseOrderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  completeMessageContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  completeMessageText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  markReceivedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  markReceivedButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  receivedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  receivedText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
