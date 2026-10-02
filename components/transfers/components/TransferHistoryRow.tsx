import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TransferSummary } from '../utils/transferModel';
import {
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_TONE,
  formatTransferDate,
  transferRouteText,
  unitsText,
} from '../utils/transferTexts';

/**
 * Fila del historial: lo mismo que la tabla de la web (número, ruta, estado,
 * unidades, quién creó, sacó y recibió) en formato de tarjeta compacta.
 */
export function TransferHistoryRow({ order, onPress }: { order: TransferSummary; onPress: () => void }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const lines: [string, string][] = [];
  lines.push(['Creado', `${formatTransferDate(order.createdAt)}${order.createdBy ? ` · ${order.createdBy.name}` : ''}`]);
  if (order.dispatchedAt) {
    lines.push(['Sacado', `${formatTransferDate(order.dispatchedAt)}${order.dispatchedBy ? ` · ${order.dispatchedBy.name}` : ''}`]);
  }
  if (order.receivedByNames.length) {
    const at = order.receivedAt ?? order.lastReceivedAt;
    lines.push(['Recibido', `${at ? `${formatTransferDate(at)} · ` : ''}${order.receivedByNames.join(', ')}`]);
  }

  return (
    <ListCard
      onPress={onPress}
      accessibilityLabel={`Traslado ${order.orderNumber}, ${transferRouteText(order)}, ${TRANSFER_STATUS_LABEL[order.status]}`}
    >
      <View style={styles.header}>
        <Text style={[styles.number, { color: colors.text.primary }]}>{order.orderNumber}</Text>
        <StatusChip label={TRANSFER_STATUS_LABEL[order.status]} tone={TRANSFER_STATUS_TONE[order.status]} />
      </View>
      <Text style={[styles.route, { color: colors.text.primary }]}>{transferRouteText(order)}</Text>
      <Text style={[styles.meta, { color: colors.text.secondary }]}>
        {order.itemsCount} producto{order.itemsCount === 1 ? '' : 's'} · {unitsText(order.totalQuantity)}
        {order.carrier ? ` · Transporta ${order.carrier.name}` : ''}
      </Text>
      {lines.map(([label, value]) => (
        <Text key={label} style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={2}>
          <Text style={styles.label}>{label}: </Text>
          {value}
        </Text>
      ))}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  number: { ...Typography.bodyStrong, flexShrink: 1 },
  route: { ...Typography.bodySmallStrong },
  meta: { ...Typography.caption },
  label: { fontWeight: '700' },
});
