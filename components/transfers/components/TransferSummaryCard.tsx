import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TransferSummary } from '../utils/transferModel';
import {
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_TONE,
  dueText,
  transferRouteText,
  unitsText,
} from '../utils/transferTexts';

type Props = {
  order: TransferSummary;
  onPress?: () => void;
};

/** Fila de la lista de traslados: número, ruta, estado y lo que falta. Vencido en rojo. */
export function TransferSummaryCard({ order, onPress }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const due = dueText(order);
  const pending =
    order.status === 'pending_dispatch'
      ? `${unitsText(order.totalQuantity)} ${order.totalQuantity === 1 ? 'reservada' : 'reservadas'}`
      : order.pendingReceiptQuantity > 0
      ? `${unitsText(order.pendingReceiptQuantity)} por recibir`
      : order.returnPendingQuantity > 0
      ? `${unitsText(order.returnPendingQuantity)} de vuelta al origen`
      : `${unitsText(order.dispatchedQuantity || order.totalQuantity)}`;

  return (
    <ListCard
      onPress={onPress}
      accessibilityLabel={`Traslado ${order.orderNumber}, ${transferRouteText(order)}, ${TRANSFER_STATUS_LABEL[order.status]}${order.isOverdue ? ', vencido' : ''}`}
      style={order.isOverdue ? { borderColor: colors.error.main } : undefined}
    >
      <View style={styles.header}>
        <Text style={[styles.number, { color: colors.text.primary }]}>{order.orderNumber}</Text>
        <StatusChip label={TRANSFER_STATUS_LABEL[order.status]} tone={TRANSFER_STATUS_TONE[order.status]} />
      </View>
      <Text style={[styles.route, { color: colors.text.primary }]}>{transferRouteText(order)}</Text>
      <Text style={[styles.meta, { color: colors.text.secondary }]}>
        {order.itemsCount} producto{order.itemsCount === 1 ? '' : 's'} · {pending}
        {order.carrier ? ` · Transporta ${order.carrier.name}` : ''}
      </Text>
      {order.isOverdue ? <StatusChip label="Vencido" tone="error" icon="schedule" /> : null}
      {due ? (
        <Text style={[styles.meta, { color: order.isOverdue ? colors.error.main : colors.text.secondary }]}>{due}</Text>
      ) : null}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  number: { ...Typography.bodyStrong, flexShrink: 1 },
  route: { ...Typography.bodySmallStrong },
  meta: { ...Typography.caption },
});
