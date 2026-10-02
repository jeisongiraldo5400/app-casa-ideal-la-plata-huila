import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WarehouseSummary } from '../utils/warehouseModel';
import { incomingText, managersText, pendingDispatchText, stockSummaryText } from '../utils/warehouseTexts';

type Props = {
  warehouse: WarehouseSummary;
  onPress?: () => void;
};

/** Tarjeta de la lista «Bodegas»: nombre, ciudad, existencias, traslados y encargados. */
export function WarehouseCard({ warehouse, onPress }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const incoming = incomingText(warehouse);
  const pending = pendingDispatchText(warehouse);
  const place = [warehouse.city, warehouse.address].filter(Boolean).join(' · ');

  return (
    <ListCard
      onPress={onPress}
      accessibilityLabel={`Bodega ${warehouse.name}${warehouse.city ? `, ${warehouse.city}` : ''}, ${stockSummaryText(warehouse)}${
        incoming ? `, ${incoming}` : ''
      }${pending ? `, ${pending}` : ''}`}
    >
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>
          {warehouse.name}
        </Text>
        {!warehouse.isActive ? <StatusChip label="Inactiva" tone="neutral" /> : null}
      </View>
      {place ? <Text style={[styles.meta, { color: colors.text.secondary }]}>{place}</Text> : null}
      <Text style={[styles.stock, { color: colors.text.primary }]}>{stockSummaryText(warehouse)}</Text>
      {incoming || pending ? (
        <View style={styles.chips}>
          {incoming ? <StatusChip label={incoming} tone="info" icon="local-shipping" /> : null}
          {pending ? <StatusChip label={pending} tone="warning" icon="outbox" /> : null}
        </View>
      ) : null}
      <Text style={[styles.meta, { color: colors.text.secondary }]}>{managersText(warehouse.managers)}</Text>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  name: { ...Typography.bodyStrong, flexShrink: 1 },
  stock: { ...Typography.bodySmallStrong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  meta: { ...Typography.caption },
});
