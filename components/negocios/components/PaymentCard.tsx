import { useTheme } from '@/components/theme';
import { IconButton, ListCard, StatusChip } from '@/components/ui';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { formatPaymentDateTime } from '@/lib/localDate';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type PaymentRow = {
  id: string;
  amount: number | string;
  paid_at: string;
  virtual_receipt_number: string | null;
  receipt_number: string | null;
  receipt_status: string | null;
  support_path?: string | null;
  support_file_name?: string | null;
  /** Nombre del usuario que registró el pago. */
  created_by_name?: string | null;
};

type Props = {
  pago: PaymentRow;
  onOpenSupport?: (path: string) => void;
  onShare: () => void;
  onPrint: () => void;
  printing?: boolean;
};

/** Tarjeta de un pago con sus recibos y acciones (soporte, PDF, imprimir). */
export function PaymentCard({ pago, onOpenSupport, onShare, onPrint, printing }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const voided = pago.receipt_status === 'anulado';
  const accent = voided ? colors.error.main : colors.success.main;
  const amount = formatCOP(Number(pago.amount));

  return (
    <ListCard
      style={voided ? styles.voided : undefined}
      accessibilityLabel={`Pago de ${amount}${voided ? ', anulado' : ''}, ${formatPaymentDateTime(pago.paid_at)}`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={voided ? 'block' : 'receipt-long'} size={IconSize.md} color={accent} />
        </View>
        <View style={styles.copy}>
          <View style={styles.amountRow}>
            <Text style={[styles.amount, { color: colors.text.primary }, voided && styles.strike]}>{amount}</Text>
            {voided ? <StatusChip label="Anulado" tone="error" /> : null}
          </View>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            {formatPaymentDateTime(pago.paid_at)} · {pago.virtual_receipt_number || 'Provisional'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>Recibo físico: {pago.receipt_number || 'No registrado'}</Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Soporte: {pago.support_path ? pago.support_file_name || 'Adjunto' : 'Sin adjunto'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Registrado por: {pago.created_by_name || 'Sin registro'}
          </Text>
        </View>
      </View>
      <View style={[styles.actions, { borderTopColor: colors.divider }]}>
        {pago.support_path && onOpenSupport ? (
          <IconButton
            icon="attach-file"
            label="Soporte"
            accessibilityLabel="Abrir soporte del pago"
            color={colors.primary.main}
            backgroundColor={`${colors.primary.main}12`}
            onPress={() => onOpenSupport(pago.support_path as string)}
            style={styles.action}
          />
        ) : null}
        <IconButton
          icon="picture-as-pdf"
          label="PDF"
          accessibilityLabel="Compartir recibo en PDF"
          color={colors.primary.main}
          backgroundColor={`${colors.primary.main}12`}
          disabled={voided}
          onPress={onShare}
          style={styles.action}
        />
        <IconButton
          icon="print"
          label="Imprimir"
          accessibilityLabel="Imprimir recibo"
          color={colors.primary.main}
          backgroundColor={`${colors.primary.main}12`}
          disabled={voided || printing}
          onPress={onPrint}
          style={styles.action}
        />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  voided: { opacity: 0.72 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  icon: { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  amount: { ...Typography.bodyStrong, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  strike: { textDecorationLine: 'line-through' },
  meta: { ...Typography.metadata, fontWeight: '400' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, marginTop: Spacing.xs },
  action: { borderWidth: 0, minWidth: 64 },
});
