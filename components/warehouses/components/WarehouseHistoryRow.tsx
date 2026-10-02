import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { formatPaymentDateTime } from '@/lib/localDate';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  WAREHOUSE_MOVEMENT_LABEL,
  WAREHOUSE_MOVEMENT_TONE,
  documentText,
  formatSignedQuantity,
  formatUnits,
  movesPhysicalStock,
} from '../utils/warehouseHistory';
import type { WarehouseHistoryRow as Row } from '../utils/warehouseModel';

/** Un movimiento: fecha, tipo, producto, ± cantidad, documento y usuario. */
export function WarehouseHistoryRow({ row }: { row: Row }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const label = WAREHOUSE_MOVEMENT_LABEL[row.movementType];
  const physical = movesPhysicalStock(row.movementType);
  const quantityColor =
    !physical || row.quantity === null || row.quantity === 0
      ? colors.text.secondary
      : row.quantity > 0
      ? colors.success.main
      : colors.error.main;
  const document = documentText(row);
  const product = row.productName
    ? `${row.productName}${row.productSku ? ` (${row.productSku})` : ''}`
    : row.detail ?? 'Bodega';

  return (
    <ListCard accessibilityLabel={`${label}, ${product}, ${formatSignedQuantity(row.quantity)}`}>
      <View style={styles.header}>
        <StatusChip label={label} tone={WAREHOUSE_MOVEMENT_TONE[row.movementType]} />
        <Text style={[styles.caption, { color: colors.text.secondary }]}>{formatPaymentDateTime(row.occurredAt)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.product, { color: colors.text.primary }]} numberOfLines={2}>
          {product}
        </Text>
        {row.quantity !== null ? (
          <Text style={[styles.quantity, { color: quantityColor }]}>{formatSignedQuantity(row.quantity)}</Text>
        ) : null}
      </View>
      {physical && row.stockAfter !== null ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]}>Quedan {formatUnits(row.stockAfter)} en bodega</Text>
      ) : null}
      {row.productName && row.detail ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]}>{row.detail}</Text>
      ) : null}
      {document || row.userName ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]}>
          {[document, row.userName ? `Por ${row.userName}` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {row.serials.length > 0 ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]}>Seriales: {row.serials.join(', ')}</Text>
      ) : null}
      {row.isCancelled ? <StatusChip label="Anulado" tone="error" /> : null}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  body: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  product: { ...Typography.bodySmallStrong, flex: 1 },
  quantity: { ...Typography.bodyStrong },
  caption: { ...Typography.caption },
});
