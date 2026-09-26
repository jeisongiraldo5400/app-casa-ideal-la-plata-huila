import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { MisCobroRow } from '@/lib/cartera/misCobros';
import { cobroReceiptData } from '@/lib/cartera/cobroReceipt';
import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import { MaterialIcons } from '@expo/vector-icons';
import { formatCOP } from '@/lib/creditCalculator';
import { formatPaymentDateTime } from '@/lib/localDate';
import { labelCuotaNombre, labelNegocioCodigo } from '@/lib/negocioLabels';
import { paymentSiteLabel } from '@/lib/paymentSite';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Cuota del pago: los abonos sin cuota se aplican en orden (FIFO). */
function cuotaLabel(row: MisCobroRow): string {
  if (row.installment_number != null) return labelCuotaNombre(row.installment_number);
  if (row.payment_kind === 'pronto_pago') return 'Todas (pronto pago)';
  return 'Abono a la cuota más antigua';
}

/** Acciones del recibo; sin ellas la tarjeta solo abre el negocio. */
export type MisCobroCardActions = {
  onShareReceipt: (data: NegocioReceiptData) => void;
  onPrintReceipt: (data: NegocioReceiptData) => void;
  onOpenSupport: (path: string) => void;
  printing?: boolean;
};

type Props = {
  row: MisCobroRow;
  onPress?: () => void;
  /** En «De mi cartera» el pago pudo registrarlo otra persona: se dice quién. */
  showRegisteredBy?: boolean;
  actions?: MisCobroCardActions;
};

export function MisCobroCard({ row, onPress, showRegisteredBy = false, actions }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const voided = row.receipt_status === 'anulado';
  const rejected = row.local_state === 'rechazado';
  const method = row.payment_method_name || 'Método no registrado';
  const site = paymentSiteLabel(row.payment_site);
  const receipt = actions ? cobroReceiptData(row) : null;
  const discount = Number(row.discount_amount || 0);

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
      {row.virtual_receipt_number || (showRegisteredBy && row.created_by_name) ? (
        <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
          {[row.virtual_receipt_number, showRegisteredBy && row.created_by_name ? `Registró ${row.created_by_name}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {row.payment_kind === 'pronto_pago' && discount > 0 ? (
        <Text style={[styles.meta, styles.strong, { color: colors.info.main }]}>
          Pronto pago · desc. {formatCOP(discount)}
        </Text>
      ) : null}
      {voided || row.local_state || row.cierre_numero ? (
        <View style={styles.chips}>
          {voided ? <StatusChip label="Anulado" tone="error" icon="block" /> : null}
          {row.local_state === 'pendiente' ? <StatusChip label="Pendiente de enviar" tone="warning" icon="cloud-upload" /> : null}
          {rejected ? <StatusChip label="Rechazado por el servidor" tone="error" icon="error-outline" /> : null}
          {row.cierre_numero ? <StatusChip label={`En cierre ${row.cierre_numero}`} tone="info" icon="lock" /> : null}
        </View>
      ) : null}
      {actions && (receipt || row.support_path) ? (
        <View style={styles.actions}>
          {row.support_path ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver soporte del pago"
              hitSlop={8}
              onPress={() => actions.onOpenSupport(row.support_path as string)}>
              <MaterialIcons name="attach-file" size={22} color={colors.primary.main} />
            </Pressable>
          ) : null}
          {receipt ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Compartir recibo en PDF"
                hitSlop={8}
                onPress={() => actions.onShareReceipt(receipt)}>
                <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary.main} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reimprimir recibo"
                hitSlop={8}
                disabled={actions.printing}
                onPress={() => actions.onPrintReceipt(receipt)}>
                <MaterialIcons name="print" size={22} color={colors.primary.main} />
              </Pressable>
            </>
          ) : null}
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
  strong: { fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.lg },
});
