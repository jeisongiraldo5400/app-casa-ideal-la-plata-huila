import { useTheme } from '@/components/theme';
import { Button, Input, ModalSheet, OptionPickerField } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { applyMoneyTextChange } from '@/lib/moneyInput';
import {
  PRONTO_PAGO_REASON_MAX_LENGTH,
  parseProntoPagoDiscount,
  prontoPagoDiscountInputOptions,
  validateProntoPago,
  type ProntoPagoSummary,
} from '@/lib/negocios/prontoPago';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

export type ProntoPagoFormValues = {
  /** Pendiente que vio el usuario (se envía como `p_expected_total`). */
  pendingTotal: number;
  discountAmount: number;
  /** Motivo opcional; `null` si quedó en blanco. */
  discountReason: string | null;
  paymentMethodId: string;
  receiptNumber: string | null;
  /** Total a pagar (dinero) = pendiente − descuento. */
  netAmount: number;
};

export type ProntoPagoNotice = { tone: 'warning' | 'error'; text: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  subtitle: string;
  /** Recargando cuotas del servidor (mora del día incluida). */
  loading: boolean;
  summary: ProntoPagoSummary | null;
  /** Decimales admitidos en el descuento (0–2). */
  decimalPlaces: number;
  paymentMethods: { id: string; name: string }[];
  paymentMethodsLoading?: boolean;
  saving: boolean;
  /** Motivo por el que no se puede registrar ahora (sin red, cola pendiente). */
  blockedReason: string | null;
  notice: ProntoPagoNotice | null;
  onSubmit: (values: ProntoPagoFormValues) => void;
};

/**
 * Hoja para liquidar el negocio con descuento por pronto pago: muestra el
 * pendiente total, pide el descuento y su motivo (opcional), calcula el total a pagar en
 * vivo y pide confirmación antes de enviar. Solo funciona con conexión.
 */
export function ProntoPagoSheet({
  visible,
  onClose,
  subtitle,
  loading,
  summary,
  decimalPlaces,
  paymentMethods,
  paymentMethodsLoading = false,
  saving,
  blockedReason,
  notice,
  onSubmit,
}: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { height } = useWindowDimensions();
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [discountText, setDiscountText] = useState('');
  const [reason, setReason] = useState('');
  const [methodId, setMethodId] = useState('');
  const [receipt, setReceipt] = useState('');
  const [showCuotas, setShowCuotas] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep('form');
    setDiscountText('');
    setReason('');
    setMethodId('');
    setReceipt('');
    setShowCuotas(false);
    setAttempted(false);
  }, [visible]);

  const pendingTotal = summary?.pendingTotal ?? 0;
  // Si el pendiente cambia (recarga tras «el saldo cambió»), se vuelve a revisar.
  useEffect(() => {
    setStep('form');
  }, [pendingTotal]);

  const discountOptions = prontoPagoDiscountInputOptions(decimalPlaces);
  const discount = parseProntoPagoDiscount(discountText, discountOptions);
  const validation = validateProntoPago({
    pendingTotal,
    discount,
    decimalPlaces: discountOptions.decimalPlaces,
    reason,
    paymentMethodId: methodId,
  });
  const cuotas = summary?.cuotas ?? [];
  const unavailable = loading || !summary || Boolean(blockedReason);
  const methodName = paymentMethods.find((method) => method.id === methodId)?.name || '';

  const review = () => {
    setAttempted(true);
    if (unavailable || !validation.valid) return;
    setStep('confirm');
  };

  const confirm = () => {
    if (unavailable || saving || !validation.valid) return;
    onSubmit({
      pendingTotal,
      discountAmount: discount,
      discountReason: reason.trim() || null,
      paymentMethodId: methodId,
      receiptNumber: receipt.trim() || null,
      netAmount: validation.netAmount,
    });
  };

  const noticeBox = (tone: 'warning' | 'error', text: string, label: string) => (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`${label}: ${text}`}
      style={[styles.notice, { backgroundColor: `${colors[tone].main}14`, borderColor: `${colors[tone].main}55` }]}>
      <Text style={[styles.noticeText, { color: colors.text.primary }]}>{text}</Text>
    </View>
  );

  const footer =
    step === 'form' ? (
      <>
        <Button title="Cancelar" variant="outline" onPress={onClose} disabled={saving} style={styles.footerButton} />
        <Button
          title="Revisar"
          onPress={review}
          disabled={unavailable || saving}
          style={styles.footerButton}
          accessibilityLabel="Revisar pronto pago"
        />
      </>
    ) : (
      <>
        <Button title="Volver" variant="outline" onPress={() => setStep('form')} disabled={saving} style={styles.footerButton} />
        <Button
          title="Confirmar pronto pago"
          onPress={confirm}
          loading={saving}
          disabled={unavailable || !validation.valid}
          style={styles.footerButton}
        />
      </>
    );

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Descuento pronto pago"
      subtitle={subtitle}
      dismissable={!saving}
      footer={footer}>
      <ScrollView style={{ maxHeight: Math.max(height * 0.6, 280) }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {blockedReason ? noticeBox('error', blockedReason, 'No disponible') : null}
        {notice ? noticeBox(notice.tone, notice.text, notice.tone === 'error' ? 'Error' : 'Aviso') : null}

        {loading && !summary ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary.main} />
            <Text style={[styles.caption, { color: colors.text.secondary }]}>Actualizando cuotas…</Text>
          </View>
        ) : null}

        {summary && step === 'form' ? (
          <>
            <View style={[styles.totalBox, { backgroundColor: colors.background.default }]}>
              <Text style={[styles.label, { color: colors.text.secondary }]}>Total pendiente</Text>
              <Text accessibilityLabel={`Total pendiente ${formatCOP(pendingTotal)}`} style={[styles.bigValue, { color: colors.text.primary }]}>
                {formatCOP(pendingTotal)}
              </Text>
              <Text style={[styles.caption, { color: colors.text.secondary }]}>
                {cuotas.length} cuota{cuotas.length === 1 ? '' : 's'} con saldo, incluidos recargos de mora
                {loading ? ' · actualizando…' : ''}
              </Text>
              {cuotas.length ? (
                <Button
                  title={showCuotas ? 'Ocultar cuotas' : 'Ver cuotas pendientes'}
                  variant="ghost"
                  size="sm"
                  icon={showCuotas ? 'expand-less' : 'expand-more'}
                  onPress={() => setShowCuotas((value) => !value)}
                  style={styles.toggle}
                />
              ) : null}
              {showCuotas ? (
                <View style={styles.cuotas}>
                  {cuotas.map((cuota) => (
                    <View key={cuota.id} style={[styles.cuotaRow, { borderTopColor: colors.divider }]}>
                      <View style={styles.cuotaCopy}>
                        <Text style={[styles.cuotaTitle, { color: colors.text.primary }]}>
                          {cuota.installmentNumber === 0 ? 'Cuota inicial' : `Cuota ${cuota.installmentNumber}`}
                        </Text>
                        <Text style={[styles.caption, { color: colors.text.secondary }]}>
                          Vence {cuota.dueDate || 'sin fecha'}
                          {cuota.lateFee > 0 ? ` · recargo ${formatCOP(cuota.lateFee)}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.cuotaValue, { color: colors.text.primary }]}>{formatCOP(cuota.saldo)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <Input
              label="Descuento"
              placeholder="0"
              keyboardType={discountOptions.decimalPlaces > 0 ? 'decimal-pad' : 'number-pad'}
              value={discountText}
              selection={{ start: discountText.length, end: discountText.length }}
              onChangeText={(text) => setDiscountText(applyMoneyTextChange(discountText, text, discountOptions).display)}
              editable={!saving}
              error={validation.discountError || undefined}
              containerStyle={styles.field}
              accessibilityLabel="Descuento"
            />

            <View style={[styles.totalBox, styles.netBox, { borderColor: colors.success.main }]}>
              <Text style={[styles.label, { color: colors.text.secondary }]}>Total a pagar</Text>
              <Text accessibilityLabel={`Total a pagar ${formatCOP(validation.netAmount)}`} style={[styles.bigValue, { color: colors.success.dark }]}>
                {formatCOP(validation.netAmount)}
              </Text>
            </View>

            <Input
              label="Motivo del descuento (opcional)"
              placeholder="Ej.: cliente paga todo el crédito por adelantado"
              value={reason}
              onChangeText={setReason}
              editable={!saving}
              multiline
              maxLength={PRONTO_PAGO_REASON_MAX_LENGTH}
              error={attempted ? validation.reasonError || undefined : undefined}
              containerStyle={styles.field}
              accessibilityLabel="Motivo del descuento"
            />

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Método de pago *</Text>
              <OptionPickerField
                value={methodId}
                onValueChange={setMethodId}
                options={paymentMethods.map((method) => ({ value: method.id, label: method.name }))}
                placeholder={paymentMethodsLoading ? 'Cargando métodos…' : 'Seleccione el método'}
                modalTitle="Método de pago"
                colors={colors}
                disabled={saving || paymentMethodsLoading || paymentMethods.length === 0}
              />
              {attempted && validation.methodError ? (
                <Text style={[styles.fieldHint, { color: colors.error.main }]}>{validation.methodError}</Text>
              ) : null}
            </View>

            <Input
              label="Recibo físico (opcional)"
              placeholder="Número del recibo"
              value={receipt}
              onChangeText={setReceipt}
              editable={!saving}
              containerStyle={styles.field}
              accessibilityLabel="Número de recibo físico"
            />
            {attempted && validation.pendingError ? (
              <Text style={[styles.fieldHint, { color: colors.error.main }]}>{validation.pendingError}</Text>
            ) : null}
          </>
        ) : null}

        {summary && step === 'confirm' ? (
          <View style={styles.confirm} accessibilityLabel="Confirmación del pronto pago">
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.text.secondary }]}>Pendiente</Text>
              <Text style={[styles.confirmValue, { color: colors.text.primary }]}>{formatCOP(pendingTotal)}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.text.secondary }]}>Descuento</Text>
              <Text style={[styles.confirmValue, { color: colors.text.primary }]}>− {formatCOP(discount)}</Text>
            </View>
            <View style={[styles.confirmRow, styles.confirmTotal, { borderTopColor: colors.divider }]}>
              <Text style={[styles.confirmLabel, { color: colors.text.primary }]}>Total a pagar</Text>
              <Text style={[styles.bigValue, { color: colors.success.dark }]}>{formatCOP(validation.netAmount)}</Text>
            </View>
            {reason.trim() ? (
              <Text style={[styles.caption, { color: colors.text.secondary }]}>Motivo: {reason.trim()}</Text>
            ) : null}
            <Text style={[styles.caption, { color: colors.text.secondary }]}>
              Método: {methodName}
              {receipt.trim() ? ` · Recibo físico ${receipt.trim()}` : ''}
            </Text>
            <Text style={[styles.warning, { color: colors.text.primary }]}>
              Todas las cuotas quedarán pagadas y el negocio quedará saldado.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  loading: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  notice: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.md },
  noticeText: { ...Typography.bodySmall },
  totalBox: { borderRadius: Radius.control, padding: Spacing.md, gap: 2 },
  netBox: { borderWidth: 1.5 },
  label: { ...Typography.label },
  bigValue: { fontSize: 24, lineHeight: 30, fontWeight: '800' },
  caption: { ...Typography.caption },
  toggle: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  cuotas: { marginTop: Spacing.xs },
  cuotaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  cuotaCopy: { flex: 1, gap: 2 },
  cuotaTitle: { ...Typography.bodySmall, fontWeight: '700' },
  cuotaValue: { ...Typography.bodySmall, fontWeight: '700' },
  field: { marginBottom: 0 },
  fieldLabel: { ...Typography.label, marginBottom: Spacing.xs },
  fieldHint: { ...Typography.caption, marginTop: Spacing.xs },
  footerButton: { flex: 1 },
  confirm: { gap: Spacing.sm },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  confirmTotal: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm },
  confirmLabel: { ...Typography.bodyStrong },
  confirmValue: { ...Typography.bodyStrong },
  warning: { ...Typography.bodySmall, fontWeight: '700', marginTop: Spacing.xs },
});
