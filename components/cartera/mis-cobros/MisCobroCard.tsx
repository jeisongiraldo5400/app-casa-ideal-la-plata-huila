import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { MisCobroRow } from '@/lib/cartera/misCobros';
import { formatCOP } from '@/lib/creditCalculator';
import { formatPaymentDateTime } from '@/lib/localDate';
import { labelCuotaNombre, labelNegocioCodigo } from '@/lib/negocioLabels';
import { paymentSiteLabel } from '@/lib/paymentSite';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Cuota del pago: los abonos sin cuota se aplican en orden (FIFO). */
function cuotaLabel(row: MisCobroRow): string {
  if (row.installment_number != null) return labelCuotaNombre(row.installment_number);
  if (row.payment_kind === 'pronto_pago') return 'Todas (pronto pago)';
  return 'Abono a la cuota más antigua';
}

export function MisCobroCard({ row, onPress }: { row: MisCobroRow; onPress?: () => void }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const voided = row.receipt_status === 'anulado';
  const rejected = row.local_state === 'rechazado';
  const method = row.payment_method_name || 'Método no registrado';
  const site = paymentSiteLabel(row.payment_site);

  return (
    <ListCard
      onPress={onPress}
      accessibilityLabel={`${row.customer_name}, ${labelNegocioCodigo(row.negocio_numero)}, ${formatCOP(row.amount)}`}
      accessibilityHint="Abre el negocio">
      <View style={styles.top}>
        <Text style={[styles.customer, { color: colors.text.primary }]} numberOfLines={1}>
          {row.customer_name}
        </Text>
        <Text
          style={[
            styles.amount,
            { color: voided || rejected ? colors.text.secondary : colors.text.primary },
            (voided || rejected) && styles.struck,
          ]}>
          {formatCOP(row.amount)}
        </Text>
      </View>
      <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
        {labelNegocioCodigo(row.negocio_numero)} · {cuotaLabel(row)}
      </Text>
      <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={2}>
        {formatPaymentDateTime(row.paid_at)} · {method}
        {row.payment_method_is_cash ? ' (efectivo)' : ''} · {site}
      </Text>
      {voided || row.local_state || row.cierre_numero ? (
        <View style={styles.chips}>
          {voided ? <StatusChip label="Anulado" tone="error" icon="block" /> : null}
          {row.local_state === 'pendiente' ? <StatusChip label="Pendiente de enviar" tone="warning" icon="cloud-upload" /> : null}
          {rejected ? <StatusChip label="Rechazado por el servidor" tone="error" icon="error-outline" /> : null}
          {row.cierre_numero ? <StatusChip label={`En cierre ${row.cierre_numero}`} tone="info" icon="lock" /> : null}
        </View>
      ) : null}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  customer: { ...Typography.bodyStrong, flex: 1 },
  amount: { ...Typography.bodyStrong, fontWeight: '800' },
  struck: { textDecorationLine: 'line-through' },
  meta: { ...Typography.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
