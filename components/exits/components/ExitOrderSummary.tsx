import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { deliveryOrderStatusLabel, deliveryOrderStatusTone } from '@/lib/inventoryOrderLabels';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

type SummaryRowProps = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  colors: ReturnType<typeof getColors>;
};

function SummaryRow({ icon, label, value, colors }: SummaryRowProps) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryIcon, { backgroundColor: colors.surface.muted }]}>
        <MaterialIcons name={icon} size={19} color={colors.primary.main} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>{label}</Text>
        <Text style={[styles.summaryValue, { color: colors.text.primary }]}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * Último paso de la configuración de salida: resumen de la orden elegida, observación
 * opcional y arranque del escaneo. Sustituye a la antigua pantalla de confirmación.
 */
export function ExitOrderSummary() {
  const selectedDeliveryOrder = useExitsStore((state) => state.selectedDeliveryOrder);
  const exitMode = useExitsStore((state) => state.exitMode);
  const deliveryObservations = useExitsStore((state) => state.deliveryObservations);
  const setDeliveryObservations = useExitsStore((state) => state.setDeliveryObservations);
  const getProgress = useExitsStore((state) => state.getSelectedDeliveryOrderProgress);
  const startExit = useExitsStore((state) => state.startExit);
  const changeDeliveryOrder = useExitsStore((state) => state.changeDeliveryOrder);
  const loading = useExitsStore((state) => state.loading);
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [showObservation, setShowObservation] = useState(deliveryObservations.trim().length > 0);

  if (!selectedDeliveryOrder) return null;

  const progress = getProgress();
  const pendingUnits = Math.max(0, (progress?.totalRequired ?? 0) - (progress?.totalRegistered ?? 0));
  const observation = deliveryObservations.trim();
  const orderType = exitMode === 'direct_user' ? 'Remisión' : 'Orden de entrega';
  const orderNumber = selectedDeliveryOrder.order_number || selectedDeliveryOrder.id.slice(0, 8);
  const recipient = selectedDeliveryOrder.customer_name || selectedDeliveryOrder.assigned_to_user_name || 'Destinatario no especificado';
  const productCount = progress ? progress.items.filter((item) => !item.isComplete).length : selectedDeliveryOrder.items.length;
  const isComplete = Boolean(progress?.items.length && progress.items.every((item) => item.isComplete));
  const statusLabel = isComplete ? 'Completa' : deliveryOrderStatusLabel(selectedDeliveryOrder.status);
  const statusTone = isComplete ? 'success' : deliveryOrderStatusTone(selectedDeliveryOrder.status);

  return (
    <View style={styles.container} accessibilityLabel="Paso 3 de 3, confirmar">
      <View style={[styles.orderCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
        <View style={styles.orderHeader}>
          <View style={styles.orderHeading}>
            <Text style={[styles.orderType, { color: colors.text.secondary }]}>{orderType}</Text>
            <Text style={[styles.orderNumber, { color: colors.text.primary }]}>#{orderNumber}</Text>
          </View>
          <StatusChip label={statusLabel} tone={statusTone} />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SummaryRow icon="person-outline" label="Destinatario" value={recipient} colors={colors} />
        {selectedDeliveryOrder.delivery_address ? (
          <SummaryRow icon="place" label="Dirección" value={selectedDeliveryOrder.delivery_address} colors={colors} />
        ) : null}
        <SummaryRow
          icon="inventory-2"
          label="Pendiente por registrar"
          value={`${productCount} ${productCount === 1 ? 'producto' : 'productos'} · ${pendingUnits} ${pendingUnits === 1 ? 'unidad' : 'unidades'}`}
          colors={colors}
        />

        <View style={[styles.warehouseNotice, { backgroundColor: colors.surface.muted, borderColor: `${colors.primary.main}30` }]}>
          <MaterialIcons name="warehouse" size={20} color={colors.primary.main} />
          <Text style={[styles.warehouseText, { color: colors.text.primary }]}>
            Cada producto sale de la bodega indicada en la orden; si hay varias, la eliges al escanear.
          </Text>
        </View>
      </View>

      {showObservation ? (
        <View style={styles.observationSection}>
          <Text style={[styles.observationLabel, { color: colors.text.primary }]}>Observación opcional</Text>
          <TextInput
            autoFocus
            multiline
            numberOfLines={4}
            value={deliveryObservations}
            onChangeText={setDeliveryObservations}
            placeholder="Ej: Recibe portería, novedad en la entrega..."
            placeholderTextColor={colors.text.secondary}
            selectionColor={colors.primary.main}
            style={[styles.observationInput, { backgroundColor: colors.background.paper, borderColor: colors.divider, color: colors.text.primary }]}
            accessibilityLabel="Observación de la entrega"
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={observation ? 'Guardar observación y escanear' : 'Comenzar a escanear'}
          onPress={startExit}
          disabled={loading || isComplete}
          icon="qr-code-scanner"
          accessibilityLabel={observation ? 'Guardar observación y comenzar el escaneo' : 'Comenzar el escaneo'}
        />
        <View style={styles.secondaryActions}>
          {!showObservation ? (
            <Button title="Agregar observación" variant="outline" onPress={() => setShowObservation(true)} disabled={loading} style={styles.secondaryButton} />
          ) : null}
          <Button title="Cambiar orden" variant="ghost" onPress={changeDeliveryOrder} disabled={loading} style={styles.secondaryButton} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.lg, marginBottom: Spacing.lg },
  orderCard: { borderRadius: Radius.card, borderWidth: 1, padding: Spacing.lg },
  orderHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderHeading: { flex: 1 },
  orderType: { ...Typography.metadata },
  orderNumber: { ...Typography.headline, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.lg },
  summaryRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  summaryIcon: { alignItems: 'center', borderRadius: Radius.control, height: 40, justifyContent: 'center', width: 40 },
  summaryCopy: { flex: 1 },
  summaryLabel: { ...Typography.metadata },
  summaryValue: { ...Typography.bodyStrong, marginTop: 1 },
  warehouseNotice: { alignItems: 'flex-start', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  warehouseText: { ...Typography.bodySmallStrong, flex: 1 },
  observationSection: { gap: Spacing.sm },
  observationLabel: { ...Typography.bodyStrong },
  observationInput: { ...Typography.body, borderRadius: Radius.control, borderWidth: 1.5, minHeight: 112, padding: Spacing.lg, textAlignVertical: 'top' },
  actions: { gap: Spacing.sm },
  secondaryActions: { flexDirection: 'row', gap: Spacing.sm },
  secondaryButton: { flex: 1, paddingHorizontal: Spacing.sm },
});
