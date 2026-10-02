import { useTheme } from '@/components/theme';
import { Card, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TransferDetail } from '../utils/transferModel';
import {
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_TONE,
  dueText,
  formatTransferDate,
  receiversText,
  transferRouteText,
} from '../utils/transferTexts';

/** Cabecera del detalle: número, estado, ruta, responsables y fechas. */
export function TransferHeaderCard({ detail }: { detail: TransferDetail }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { order, receivers } = detail;
  const due = dueText(order);
  const rows: [string, string][] = [
    ['Transporta', order.carrier?.name ?? 'Sin transportador'],
    ['Creado', `${formatTransferDate(order.createdAt)}${order.createdBy ? ` · ${order.createdBy.name}` : ''}`],
  ];
  if (order.dispatchedAt) {
    rows.push(['Despachado', `${formatTransferDate(order.dispatchedAt)}${order.dispatchedBy ? ` · ${order.dispatchedBy.name}` : ''}`]);
  }
  // Quiénes pueden recibir (20261231450000): los habilitados al despachar o,
  // en traslados viejos, la regla anterior.
  const canReceive = receiversText(detail);
  if (canReceive) rows.push(['Pueden recibir', canReceive]);
  // Quién recibió (20261231340000).
  if (order.receivedByNames.length) {
    const at = order.receivedAt ?? order.lastReceivedAt;
    rows.push(['Recibido', `${at ? `${formatTransferDate(at)} · ` : ''}${order.receivedByNames.join(', ')}`]);
  }
  if (order.notes) rows.push(['Notas', order.notes]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.number, { color: colors.text.primary }]}>{order.orderNumber}</Text>
        <StatusChip label={TRANSFER_STATUS_LABEL[order.status]} tone={TRANSFER_STATUS_TONE[order.status]} />
      </View>
      <Text style={[styles.route, { color: colors.text.primary }]}>{transferRouteText(order)}</Text>
      {rows.map(([label, value]) => (
        <Text key={label} style={[styles.row, { color: colors.text.secondary }]}>
          <Text style={styles.rowLabel}>{label}: </Text>
          {value}
        </Text>
      ))}
      {due ? (
        <Text style={[styles.due, { color: order.isOverdue ? colors.error.main : colors.text.secondary }]}>{due}</Text>
      ) : null}
      {receivers.length === 0 && order.status !== 'cancelled' ? (
        <Text style={[styles.row, { color: colors.warning.dark }]}>
          {order.destinationWarehouse.name} no tiene bodegueros activos que puedan recibir.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  number: { ...Typography.section, flexShrink: 1 },
  route: { ...Typography.bodyStrong },
  row: { ...Typography.caption },
  rowLabel: { fontWeight: '700' },
  due: { ...Typography.bodySmallStrong },
});
