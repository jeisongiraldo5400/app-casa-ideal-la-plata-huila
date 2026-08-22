import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { ScreenState } from '@/components/ui/ScreenState';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  sent_by_remission: 'En remisión',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

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

export function ExitOrderConfirmation() {
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
  const insets = useSafeAreaInsets();
  const [showObservation, setShowObservation] = useState(
    deliveryObservations.trim().length > 0,
  );

  const progress = getProgress();
  const pendingUnits = Math.max(
    0,
    (progress?.totalRequired ?? 0) - (progress?.totalRegistered ?? 0),
  );
  const observation = deliveryObservations.trim();

  if (!selectedDeliveryOrder) {
    return (
      <View style={[styles.missingContainer, { backgroundColor: colors.background.default }]}>
        <ScreenState
          title="No fue posible confirmar la orden"
          description="Regresa al listado y selecciona nuevamente la orden de entrega."
          icon="error-outline"
          actionLabel="Cambiar orden"
          onAction={changeDeliveryOrder}
        />
      </View>
    );
  }

  const orderType = exitMode === 'direct_user' ? 'Remisión' : 'Orden de entrega';
  const orderNumber = selectedDeliveryOrder.order_number || selectedDeliveryOrder.id.slice(0, 8);
  const recipient =
    selectedDeliveryOrder.customer_name ||
    selectedDeliveryOrder.assigned_to_user_name ||
    'Destinatario no especificado';
  const productCount = progress
    ? progress.items.filter((item) => !item.isComplete).length
    : selectedDeliveryOrder.items.length;
  const statusLabel = STATUS_LABELS[selectedDeliveryOrder.status] || selectedDeliveryOrder.status || 'Pendiente';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeading} accessibilityLabel="Paso 3 de 3, confirmación">
          <View style={[styles.stepBadge, { backgroundColor: colors.primary.main }]}>
            <Text style={[styles.stepBadgeText, { color: colors.primary.contrastText }]}>3</Text>
          </View>
          <View style={styles.stepCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary.main }]}>PASO 3 DE 3</Text>
            <Text style={[styles.title, { color: colors.text.primary }]}>Confirma la salida</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Revisa la orden antes de comenzar a escanear.</Text>
          </View>
        </View>

        <View style={[styles.orderCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
          <View style={styles.orderHeader}>
            <View style={styles.orderHeading}>
              <Text style={[styles.orderType, { color: colors.text.secondary }]}>{orderType}</Text>
              <Text style={[styles.orderNumber, { color: colors.text.primary }]}>#{orderNumber}</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: `${colors.warning.main}18` }]}>
              <Text style={[styles.statusText, { color: colors.warning.main }]}>{statusLabel}</Text>
            </View>
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
            <Text style={[styles.warehouseText, { color: colors.text.primary }]}>La bodega se asignará automáticamente según cada producto de la orden.</Text>
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
              style={[
                styles.observationInput,
                {
                  backgroundColor: colors.background.paper,
                  borderColor: colors.divider,
                  color: colors.text.primary,
                },
              ]}
              accessibilityLabel="Observación de la entrega"
            />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background.paper,
            borderTopColor: colors.divider,
            paddingBottom: Math.max(insets.bottom, Spacing.md),
          },
        ]}>
        <Button
          title={observation ? 'Guardar observación y continuar' : 'Continuar sin observaciones'}
          onPress={startExit}
          disabled={loading}
          accessibilityLabel={observation ? 'Guardar observación y comenzar el escaneo' : 'Continuar sin observaciones y comenzar el escaneo'}
        />
        <View style={styles.secondaryActions}>
          <Button
            title="Agregar observación"
            variant="outline"
            onPress={() => setShowObservation(true)}
            disabled={loading}
            style={styles.secondaryButton}
          />
          <Button
            title="Cambiar orden"
            variant="ghost"
            onPress={changeDeliveryOrder}
            disabled={loading}
            style={styles.secondaryButton}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  missingContainer: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
  stepHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  stepBadge: { alignItems: 'center', borderRadius: Radius.pill, height: 34, justifyContent: 'center', width: 34 },
  stepBadgeText: { fontSize: 15, fontWeight: '800' },
  stepCopy: { flex: 1 },
  eyebrow: { ...Typography.metadata, fontWeight: '800', letterSpacing: 0.5 },
  title: { ...Typography.title, fontSize: 27, lineHeight: 32, marginTop: 2 },
  subtitle: { ...Typography.body, marginTop: Spacing.xs },
  orderCard: { borderRadius: Radius.card, borderWidth: 1, padding: Spacing.lg },
  orderHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderHeading: { flex: 1 },
  orderType: { ...Typography.metadata },
  orderNumber: { fontSize: 21, fontWeight: '800', marginTop: 2 },
  statusChip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  statusText: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.lg },
  summaryRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  summaryIcon: { alignItems: 'center', borderRadius: Radius.control, height: 40, justifyContent: 'center', width: 40 },
  summaryCopy: { flex: 1 },
  summaryLabel: { ...Typography.metadata },
  summaryValue: { ...Typography.bodyStrong, marginTop: 1 },
  warehouseNotice: { alignItems: 'flex-start', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  warehouseText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  observationSection: { marginTop: Spacing.xl },
  observationLabel: { ...Typography.bodyStrong, marginBottom: Spacing.sm },
  observationInput: { borderRadius: Radius.control, borderWidth: 1.5, fontSize: 15, minHeight: 112, padding: Spacing.lg, textAlignVertical: 'top' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.xs, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  secondaryActions: { flexDirection: 'row', gap: Spacing.sm },
  secondaryButton: { flex: 1, paddingHorizontal: Spacing.sm },
});
