import { useTheme } from '@/components/theme';
import { Button, Input, ModalSheet } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { formatPaymentDateTime } from '@/lib/localDate';
import { isProntoPago, pagoDiscount } from '@/lib/negocios/negocioBalance';
import { VOID_REASON_MAX_LENGTH, validateVoidReason } from '@/lib/negocios/voidNegocioPago';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type VoidPagoTarget = {
  id: string;
  amount: number | string;
  paid_at: string;
  virtual_receipt_number: string | null;
  payment_kind?: string | null;
  discount_amount?: number | string | null;
};

type Props = {
  pago: VoidPagoTarget | null;
  onClose: () => void;
  saving: boolean;
  /** Mensaje del último intento fallido (permiso, pronto pago vigente…). */
  errorText?: string | null;
  onConfirm: (reason: string) => void;
};

/** Hoja para anular un pago con motivo obligatorio. Solo con conexión. */
export function VoidPagoSheet({ pago, onClose, saving, errorText, onConfirm }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    setReason('');
    setAttempted(false);
  }, [pago?.id]);

  const reasonError = validateVoidReason(reason);
  const prontoPago = pago ? isProntoPago(pago) : false;

  const submit = () => {
    setAttempted(true);
    if (reasonError || saving) return;
    onConfirm(reason.trim());
  };

  return (
    <ModalSheet
      visible={Boolean(pago)}
      onClose={onClose}
      title={prontoPago ? 'Anular pronto pago' : 'Anular pago'}
      subtitle={pago ? `${pago.virtual_receipt_number || 'Pago'} · ${formatPaymentDateTime(pago.paid_at)}` : undefined}
      dismissable={!saving}
      footer={
        <>
          <Button title="Cancelar" variant="outline" onPress={onClose} disabled={saving} style={styles.footerButton} />
          <Button
            title={prontoPago ? 'Anular pronto pago' : 'Anular pago'}
            variant="destructive"
            onPress={submit}
            loading={saving}
            style={styles.footerButton}
            accessibilityLabel="Confirmar anulación del pago"
          />
        </>
      }>
      {pago ? (
        <Text style={[styles.body, { color: colors.text.primary }]}>
          {prontoPago
            ? `Se anulará el pronto pago de ${formatCOP(Number(pago.amount))} con descuento de ${formatCOP(pagoDiscount(pago))}. Las cuotas vuelven a quedar pendientes (con sus recargos) y el negocio se reabre.`
            : `Se anulará el pago de ${formatCOP(Number(pago.amount))} y su valor se devolverá a las cuotas. Si el negocio estaba cerrado, se reabre.`}
        </Text>
      ) : null}
      {errorText ? (
        <View
          accessibilityRole="alert"
          style={[styles.error, { backgroundColor: `${colors.error.main}14`, borderColor: `${colors.error.main}55` }]}>
          <Text style={[styles.errorText, { color: colors.text.primary }]}>{errorText}</Text>
        </View>
      ) : null}
      <Input
        label="Motivo de la anulación *"
        placeholder="Ej.: pago registrado dos veces"
        value={reason}
        onChangeText={setReason}
        editable={!saving}
        multiline
        maxLength={VOID_REASON_MAX_LENGTH}
        error={attempted ? reasonError || undefined : undefined}
        containerStyle={styles.field}
        accessibilityLabel="Motivo de la anulación"
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  body: { ...Typography.bodySmall },
  error: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.md },
  errorText: { ...Typography.bodySmall },
  field: { marginBottom: 0 },
  footerButton: { flex: 1 },
});
