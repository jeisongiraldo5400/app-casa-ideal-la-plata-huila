import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function EntrySessionContext() {
  const entryType = useEntriesStore((state) => state.entryType);
  const selectedPurchaseOrder = useEntriesStore((state) => state.selectedPurchaseOrder);
  const registeredEntriesCache = useEntriesStore((state) => state.registeredEntriesCache);
  const scannedItemsProgress = useEntriesStore((state) =>
    JSON.stringify(Array.from(state.scannedItemsProgress.entries()))
  );
  void registeredEntriesCache;
  void scannedItemsProgress;

  const progress = selectedPurchaseOrder
    ? useEntriesStore.getState().getSelectedPurchaseOrderProgress()
    : null;
  const pending = progress ? Math.max(progress.totalRequired - progress.totalRegistered, 0) : null;
  const title = selectedPurchaseOrder
    ? `OC #${selectedPurchaseOrder.order_number || selectedPurchaseOrder.id.slice(0, 8)}`
    : entryType === 'INITIAL_LOAD' ? 'Carga inicial' : 'Entrada manual';

  return (
    <View style={styles.container} accessibilityLabel="Contexto de la entrada actual">
      <MaterialIcons name="inventory-2" size={22} color={Colors.primary.main} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {pending === null ? 'Registra los productos recibidos' : `${pending} unidades pendientes por recibir`}
        </Text>
      </View>
      {progress && <View style={styles.badge}><Text style={styles.badgeText}>{progress.totalScanned}/{pending}</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: Colors.primary.light + '24', borderColor: Colors.primary.main + '45', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, padding: 12 },
  content: { flex: 1, marginLeft: 10 },
  title: { color: Colors.text.primary, fontSize: 14, fontWeight: '700' },
  detail: { color: Colors.text.secondary, fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: Colors.primary.main, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: Colors.primary.contrastText, fontSize: 12, fontWeight: '700' },
});
