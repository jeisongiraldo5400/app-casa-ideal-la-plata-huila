import { useTheme } from '@/components/theme';
import { IconButton, ListCard, StatusChip } from '@/components/ui';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { formatPaymentDateTime } from '@/lib/localDate';
import { isProntoPago, pagoDiscount } from '@/lib/negocios/negocioBalance';
import { paymentSiteLabel } from '@/lib/paymentSite';
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
  /** Método de pago; los pagos anteriores al catálogo no tienen. */
  payment_method_name?: string | null;
  /** Sitio de pago crudo ('almacen' | 'app_movil'); los pagos anteriores no tienen. */
  payment_site?: string | null;
  /** 'abono' | 'pronto_pago'; los pagos anteriores al pronto pago no tienen. */
  payment_kind?: string | null;
  /** Descuento por pronto pago (no es dinero recibido). */
  discount_amount?: number | string | null;
  discount_reason?: string | null;
  /** Pendiente total que liquidó el pronto pago. */
  expected_total?: number | string | null;
  /** Nota del pago; al anular, el servidor añade «Anulado: <motivo>». */
  notes?: string | null;
  /** Cierre de recaudo que consolidó el pago (solo con datos del servidor). */
  cierre_id?: string | null;
  /** Número del cierre (CR-…); null si RLS no deja leerlo. */
  cierre_numero?: string | null;
};

type Props = {
  pago: PaymentRow;
  onOpenSupport?: (path: string) => void;
  onShare: () => void;
  onPrint: () => void;
  printing?: boolean;
  /** Si viene, se muestra «Anular» (con permiso, con conexión y pago vigente). */
  onVoid?: () => void;
};

/** Tarjeta de un pago con sus recibos y acciones (soporte, PDF, imprimir). */
export function PaymentCard({ pago, onOpenSupport, onShare, onPrint, printing, onVoid }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const voided = pago.receipt_status === 'anulado';
  const accent = voided ? colors.error.main : colors.success.main;
  const amount = formatCOP(Number(pago.amount));
  const prontoPago = isProntoPago(pago);
  const discount = pagoDiscount(pago);
  const voidNote = voided ? voidReasonFromNotes(pago.notes) : null;

  return (
    <ListCard
      style={voided ? styles.voided : undefined}
      accessibilityLabel={`${prontoPago ? 'Pronto pago' : 'Pago'} de ${amount}${prontoPago ? ` con descuento de ${formatCOP(discount)}` : ''}${voided ? ', anulado' : ''}, ${formatPaymentDateTime(pago.paid_at)}`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={voided ? 'block' : 'receipt-long'} size={IconSize.md} color={accent} />
        </View>
        <View style={styles.copy}>
          <View style={styles.amountRow}>
            <Text style={[styles.amount, { color: colors.text.primary }, voided && styles.strike]}>{amount}</Text>
            {prontoPago ? <StatusChip label="Pronto pago" tone="info" icon="bolt" /> : null}
            {voided ? <StatusChip label="Anulado" tone="error" /> : null}
          </View>
          {prontoPago ? (
            <>
              <Text style={[styles.meta, { color: colors.text.secondary }]}>
                Total pendiente: {formatCOP(Number(pago.expected_total ?? Number(pago.amount) + discount))}
              </Text>
              <Text style={[styles.meta, styles.discount, { color: colors.text.primary }]}>
                Descuento pronto pago: {formatCOP(discount)}
              </Text>
              {pago.discount_reason?.trim() ? (
                <Text style={[styles.meta, { color: colors.text.secondary }]}>
                  Motivo del descuento: {pago.discount_reason.trim()}
                </Text>
              ) : null}
            </>
          ) : null}
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            {formatPaymentDateTime(pago.paid_at)} · {pago.virtual_receipt_number || 'Provisional'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>Recibo físico: {pago.receipt_number || 'No registrado'}</Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Método: {pago.payment_method_name || 'No registrado'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Sitio: {paymentSiteLabel(pago.payment_site)}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Soporte: {pago.support_path ? pago.support_file_name || 'Adjunto' : 'Sin adjunto'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Registrado por: {pago.created_by_name || 'Sin registro'}
          </Text>
          {pago.cierre_id && !voided ? (
            <Text style={[styles.meta, { color: colors.text.secondary }]}>
              {pago.cierre_numero ? `En cierre de recaudo ${pago.cierre_numero}` : 'En cierre de recaudo'} · solo un administrador puede anularlo
            </Text>
          ) : null}
          {voidNote ? (
            <Text style={[styles.meta, { color: colors.error.main }]}>Motivo de anulación: {voidNote}</Text>
          ) : null}
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
        {onVoid && !voided ? (
          <IconButton
            icon="block"
            label="Anular"
            accessibilityLabel={`Anular ${prontoPago ? 'pronto pago' : 'pago'} ${pago.virtual_receipt_number || ''}`.trim()}
            color={colors.error.main}
            backgroundColor={`${colors.error.main}12`}
            onPress={onVoid}
            style={styles.action}
          />
        ) : null}
      </View>
    </ListCard>
  );
}

/** Motivo que `void_negocio_pago` agrega a las notas («Anulado: <motivo>»). */
export function voidReasonFromNotes(notes: string | null | undefined): string | null {
  const match = String(notes ?? '').match(/(?:^|\n)Anulado:\s*([^\n]*)\s*$/);
  return match?.[1]?.trim() || null;
}

const styles = StyleSheet.create({
  voided: { opacity: 0.72 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  icon: { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  amount: { ...Typography.bodyStrong, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  strike: { textDecorationLine: 'line-through' },
  meta: { ...Typography.metadata, fontWeight: '400' },
  discount: { fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, marginTop: Spacing.xs },
  action: { borderWidth: 0, minWidth: 64 },
});
