import { useTheme } from '@/components/theme';
import { Card, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TransferDetail } from '../utils/transferModel';
import { RECEIVABLE } from '../utils/transferRules';
import {
  NO_RECEIVER_DETAIL_TEXT,
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_TONE,
  assignmentText,
  dueText,
  formatTransferDate,
  transferRouteText,
} from '../utils/transferTexts';

/** Cabecera del detalle: número, estado, ruta, responsables y fechas. */
export function TransferHeaderCard({ detail }: { detail: TransferDetail }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { order } = detail;
  const due = dueText(order);
  const rows: [string, string][] = [
    ['Transporta', order.carrier?.name ?? 'Sin transportador'],
    ['Creado', `${formatTransferDate(order.createdAt)}${order.createdBy ? ` · ${order.createdBy.name}` : ''}`],
  ];
  if (order.dispatchedAt) {
    rows.push(['Despachado', `${formatTransferDate(order.dispatchedAt)}${order.dispatchedBy ? ` · ${order.dispatchedBy.name}` : ''}`]);
  }
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
      {/* Asignados por el admin al crear (20261231470000). */}
      <Text style={[styles.assignment, { color: colors.text.primary }]}>{assignmentText(order)}</Text>
      {rows.map(([label, value]) => (
        <Text key={label} style={[styles.row, { color: colors.text.secondary }]}>
          <Text style={styles.rowLabel}>{label}: </Text>
          {value}
        </Text>
      ))}
      {due ? (
        <Text style={[styles.due, { color: order.isOverdue ? colors.error.main : colors.text.secondary }]}>{due}</Text>
      ) : null}
      {!order.receiver && (order.status === 'pending_dispatch' || RECEIVABLE.includes(order.status)) ? (
        <Text style={[styles.row, { color: colors.warning.dark }]}>{NO_RECEIVER_DETAIL_TEXT}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  number: { ...Typography.section, flexShrink: 1 },
  route: { ...Typography.bodyStrong },
  assignment: { ...Typography.bodySmall },
  row: { ...Typography.caption },
  rowLabel: { fontWeight: '700' },
  due: { ...Typography.bodySmallStrong },
});
