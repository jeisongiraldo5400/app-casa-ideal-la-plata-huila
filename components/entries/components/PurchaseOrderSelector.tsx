import React from "react";
import { useShallow } from 'zustand/react/shallow';

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
import { StatusChip } from "@/components/ui/StatusChip";
import { Radius, Spacing, Typography, getColors } from "@/constants/theme";
import { useTheme } from '@/components/theme';
import { purchaseOrderStatusLabel, purchaseOrderStatusTone } from '@/lib/inventoryOrderLabels';

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
  const { purchaseOrderValidations, loadPurchaseOrders: loadEntriesPurchaseOrders } = useEntriesStore(useShallow((state) => ({ purchaseOrderValidations: state.purchaseOrderValidations, loadPurchaseOrders: state.loadPurchaseOrders })));
  const { markOrderAsReceived, validateOrderIsComplete } = usePurchaseOrders();

  // Hooks
  const { canMarkOrderAsReceived } = useUserRoles();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);

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
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled: isOrderComplete }}
            accessibilityLabel={`Orden ${order.order_number || order.id.slice(0, 8)}, ${purchaseOrderStatusLabel(order.status)}`}
          >
            <Card
              style={[
                styles.orderCard,
                { borderColor: Colors.divider },
                ...(isSelected ? [{ borderColor: Colors.primary.main, backgroundColor: `${Colors.primary.main}12` }] : []),
                ...(isOrderComplete ? [{ opacity: 0.7, backgroundColor: `${Colors.success.main}14` }] : []),
              ]}
            >
              <View style={styles.orderHeader}>
                <View style={styles.orderHeaderLeft}>
                  <Text style={[styles.orderId, { color: Colors.text.primary }]}>OC #{order.order_number || order.id.slice(0, 8)}</Text>
                  <StatusChip label={purchaseOrderStatusLabel(order.status)} tone={purchaseOrderStatusTone(order.status)} />
                  <StatusChip label={isComplete ? 'Completa' : 'Incompleta'} tone={isComplete ? 'success' : 'error'} icon={isComplete ? 'check-circle' : 'radio-button-unchecked'} />
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
                  backgroundColor: `${Colors.success.main}14`,
                  borderColor: Colors.success.main
                }]}>
                  <Text style={[styles.completeMessageText, { color: Colors.success.main }]}>
                    ✓ Orden completa - No se pueden escanear más productos
                  </Text>
                  {canMarkOrderAsReceived() && (
                    <TouchableOpacity
                      style={[styles.markReceivedButton, { backgroundColor: `${Colors.success.main}15` }]}
                      onPress={() => handleMarkAsReceived(order.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <MaterialIcons name="check-circle" size={20} color={Colors.success.main} />
                      <Text style={[styles.markReceivedButtonText, { color: Colors.success.main }]}>Marcar como recibida</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {order.status === 'received' && (
                <View style={[styles.receivedBadge, { backgroundColor: `${Colors.success.main}15` }]}>
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
  container: { flex: 1 },
  emptyCard: { alignItems: "center", justifyContent: "center", padding: Spacing.xxl },
  emptyText: { ...Typography.bodySmall, textAlign: "center" },
  orderCard: { borderWidth: 2, marginBottom: Spacing.md, padding: Spacing.lg },
  orderHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: Spacing.sm },
  orderHeaderLeft: { alignItems: "center", flex: 1, flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  orderId: { ...Typography.bodyStrong, fontSize: 16 },
  orderDate: { ...Typography.metadata },
  orderNotes: { ...Typography.bodySmall, fontStyle: "italic", marginBottom: Spacing.sm },
  orderSummary: { borderTopWidth: 1, marginBottom: Spacing.md, paddingTop: Spacing.sm },
  summaryText: { ...Typography.bodySmall, fontWeight: "500" },
  productsList: { marginTop: Spacing.sm },
  productsListTitle: { ...Typography.bodySmallStrong, marginBottom: Spacing.sm },
  productItem: { alignItems: "center", borderRadius: Radius.chip, flexDirection: "row", justifyContent: "space-between", marginBottom: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  productName: { ...Typography.caption, flex: 1, marginRight: Spacing.sm },
  productQuantity: { ...Typography.caption, fontWeight: "500" },
  moreProducts: { ...Typography.metadata, fontStyle: "italic", marginTop: Spacing.xs },
  selectedIndicator: { alignItems: "center", borderTopWidth: 1, marginTop: Spacing.md, paddingTop: Spacing.md },
  selectedText: { ...Typography.bodySmallStrong },
  completeMessageContainer: { borderRadius: Radius.chip, borderWidth: 1, marginTop: Spacing.md, padding: Spacing.md },
  completeMessageText: { ...Typography.bodySmallStrong, marginBottom: Spacing.md, textAlign: "center" },
  markReceivedButton: { alignItems: "center", borderRadius: Radius.chip, flexDirection: "row", gap: Spacing.sm, justifyContent: "center", marginTop: Spacing.sm, minHeight: 44, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  markReceivedButtonText: { ...Typography.bodySmallStrong },
  receivedBadge: { alignItems: "center", borderRadius: Radius.chip, flexDirection: "row", gap: Spacing.sm, justifyContent: "center", marginTop: Spacing.md, minHeight: 44, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  receivedText: { ...Typography.bodySmallStrong },
});
