import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TYPE_LABELS = {
  PO_ENTRY: 'Entrada con orden de compra',
  ENTRY: 'Entrada manual',
  INITIAL_LOAD: 'Carga inicial',
} as const;

export function EntryConfirmation() {
  const store = useEntriesStore();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const supplier = store.suppliers.find((item) => item.id === store.supplierId)?.name || 'Sin proveedor';
  const warehouse = store.warehouses.find((item) => item.id === store.warehouseId)?.name || 'Bodega seleccionada';
  const progress = store.getSelectedPurchaseOrderProgress();
  const pending = progress ? Math.max(progress.totalRequired - progress.totalRegistered, 0) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 150 + insets.bottom }]}>
        <View style={styles.heading}>
          <View style={[styles.icon, { backgroundColor: `${colors.success.main}18` }]}>
            <MaterialIcons name="inventory" size={29} color={colors.success.main} />
          </View>
          <Text style={[styles.title, { color: colors.text.primary }]}>Confirmar entrada</Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Revisa el destino antes de comenzar a recibir productos.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
          <SummaryRow icon="swap-vert" label="Tipo" value={store.entryType ? TYPE_LABELS[store.entryType] : '—'} colors={colors} />
          {store.entryType !== 'INITIAL_LOAD' ? <SummaryRow icon="business" label="Proveedor" value={supplier} colors={colors} /> : null}
          {store.selectedPurchaseOrder ? <SummaryRow icon="receipt-long" label="Orden" value={`#${store.selectedPurchaseOrder.order_number || store.selectedPurchaseOrder.id.slice(0, 8)}`} colors={colors} /> : null}
          <SummaryRow icon="warehouse" label="Bodega de destino" value={warehouse} colors={colors} />
        </View>

        {progress ? (
          <View style={[styles.progressCard, { backgroundColor: colors.surface.muted }]}>
            <MaterialIcons name="inventory-2" size={22} color={colors.primary.main} />
            <View style={styles.progressCopy}>
              <Text style={[styles.progressTitle, { color: colors.text.primary }]}>{progress.items.length} productos · {pending} unidades pendientes</Text>
              <Text style={[styles.progressText, { color: colors.text.secondary }]}>{progress.totalRegistered} de {progress.totalRequired} unidades ya fueron recibidas.</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.progressCard, { backgroundColor: colors.surface.muted }]}>
            <MaterialIcons name="info-outline" size={22} color={colors.primary.main} />
            <Text style={[styles.progressCopy, styles.progressText, { color: colors.text.secondary }]}>Los productos aumentarán el inventario de la bodega seleccionada.</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <Button title="Comenzar a escanear" onPress={store.startEntry} />
        <Button title="Cambiar configuración" variant="ghost" onPress={store.goBackToSetup} />
      </View>
    </View>
  );
}

type Colors = ReturnType<typeof getColors>;

function SummaryRow({ icon, label, value, colors }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; value: string; colors: Colors }) {
  return (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.surface.muted }]}><MaterialIcons name={icon} size={20} color={colors.primary.main} /></View>
      <View style={styles.rowCopy}><Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text><Text style={[styles.value, { color: colors.text.primary }]}>{value}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl },
  heading: { alignItems: 'center', marginBottom: Spacing.xl },
  icon: { alignItems: 'center', borderRadius: Radius.card, height: 58, justifyContent: 'center', marginBottom: Spacing.md, width: 58 },
  title: { ...Typography.title },
  subtitle: { ...Typography.body, marginTop: Spacing.sm, textAlign: 'center' },
  card: { borderRadius: Radius.card, borderWidth: 1, overflow: 'hidden', ...Shadows.card },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', padding: Spacing.lg },
  rowIcon: { alignItems: 'center', borderRadius: Radius.control, height: 42, justifyContent: 'center', width: 42 },
  rowCopy: { flex: 1, marginLeft: Spacing.md },
  label: { ...Typography.metadata },
  value: { ...Typography.bodyStrong, marginTop: 2 },
  progressCard: { alignItems: 'center', borderRadius: Radius.card, flexDirection: 'row', marginTop: Spacing.lg, padding: Spacing.lg },
  progressCopy: { flex: 1, marginLeft: Spacing.md },
  progressTitle: { ...Typography.bodyStrong },
  progressText: { ...Typography.metadata, marginTop: 3 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, gap: Spacing.sm, left: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, position: 'absolute', right: 0, ...Shadows.floating },
});
