import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function ExitSessionContext() {
  const selectedDeliveryOrder = useExitsStore((state) => state.selectedDeliveryOrder);
  const registeredExitsCache = useExitsStore((state) => state.registeredExitsCache);
  const scannedItemsProgress = useExitsStore((state) =>
    JSON.stringify(Array.from(state.scannedItemsProgress.entries()))
  );
  void registeredExitsCache;
  void scannedItemsProgress;
  const progress = selectedDeliveryOrder
    ? useExitsStore.getState().getSelectedDeliveryOrderProgress()
    : null;

  if (!selectedDeliveryOrder || !progress) {
    return null;
  }

  const pending = Math.max(progress.totalRequired - progress.totalRegistered, 0);

  return (
    <View style={styles.container} accessibilityLabel="Contexto de la salida actual">
      <MaterialIcons name="local-shipping" size={22} color={Colors.primary.main} />
      <View style={styles.content}>
        <Text style={styles.order} numberOfLines={1}>
          OE #{selectedDeliveryOrder.order_number || selectedDeliveryOrder.id.slice(0, 8)}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {selectedDeliveryOrder.customer_name} · {pending} unidades pendientes
        </Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{progress.totalScanned}/{pending}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: Colors.primary.light + '24',
    borderColor: Colors.primary.main + '45',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
  },
  content: { flex: 1, marginLeft: 10 },
  order: { color: Colors.text.primary, fontSize: 14, fontWeight: '700' },
  detail: { color: Colors.text.secondary, fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: Colors.primary.main, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: Colors.primary.contrastText, fontSize: 12, fontWeight: '700' },
});
