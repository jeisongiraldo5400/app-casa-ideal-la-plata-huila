import { useTheme } from '@/components/theme';
import { Button, Input, ModalSheet, OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { MAX_MONEY_DECIMALS, applyMoneyTextChange } from '@/lib/moneyInput';
import { pagoAmountInputOptions } from '@/lib/negocios/registerPagoRpc';
import type { PagoSupportLocalFile } from '@/lib/uploadPagoSupport';
import { PagoSupportPicker, type PagoSupportSource } from './PagoSupportPicker';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type { PagoSupportSource };

type Props = {
  visible: boolean;
  onClose: () => void;
  subtitle: string;
  pendingBalance: number;
  /** Texto del campo tal como se pinta: puntos de miles y coma decimal («93.333,33»). */
  amount: string;
  /** Recibe el siguiente texto ya formateado; el monto se obtiene con `parsePagoAmountInput`. */
  onChangeAmount: (display: string) => void;
  /**
   * Decimales admitidos (`money_decimal_places` de la configuración, 0–2).
   * Por defecto 2: las cuotas pueden tener centavos.
   */
  amountDecimalPlaces?: number;
  /** Debajo del valor: atajos («Valor de la cuota vencida», «Cuota actual»). */
  amountAccessory?: React.ReactNode;
  receipt: string;
  onChangeReceipt: (value: string) => void;
  /** Métodos de pago disponibles; la selección es obligatoria. */
  paymentMethods: { id: string; name: string }[];
  paymentMethodId: string;
  onChangePaymentMethod: (value: string) => void;
  paymentMethodsLoading?: boolean;
  /** El método elegido requiere adjuntar el soporte (p. ej. consignación). */
  supportRequired?: boolean;
  supportFile: PagoSupportLocalFile | null;
  onPickSupport: (source: PagoSupportSource) => void;
  onRemoveSupport: () => void;
  saving: boolean;
  onSubmit: () => void;
};

/**
 * Hoja modal para registrar un pago (valor, recibo físico y soporte). El
 * selector del soporte es `PagoSupportPicker`, compartido con el pronto pago.
 */
export function RegisterPaymentSheet({
  visible,
  onClose,
  subtitle,
  pendingBalance,
  amount,
  onChangeAmount,
  amountDecimalPlaces = MAX_MONEY_DECIMALS,
  amountAccessory,
  receipt,
  onChangeReceipt,
  paymentMethods,
  paymentMethodId,
  onChangePaymentMethod,
  paymentMethodsLoading = false,
  supportRequired = false,
  supportFile,
  onPickSupport,
  onRemoveSupport,
  saving,
  onSubmit,
}: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const missingRequiredSupport = supportRequired && !supportFile;
  const amountOptions = pagoAmountInputOptions(amountDecimalPlaces);
  const acceptsDecimals = amountOptions.decimalPlaces > 0;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Registrar pago"
      subtitle={subtitle}
      dismissable={!saving}
      footer={
        <>
          <Button title="Cancelar" variant="outline" onPress={onClose} disabled={saving} style={styles.footerButton} />
          <Button
            title="Guardar pago"
            onPress={onSubmit}
            loading={saving}
            disabled={!paymentMethodId || missingRequiredSupport}
            style={styles.footerButton}
          />
        </>
      }>
      <Text style={[styles.balance, { color: colors.text.secondary }]}>
        Saldo pendiente: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{formatCOP(pendingBalance)}</Text>
      </Text>
      <Input
        label="Valor del pago"
        placeholder="0"
        // `decimal-pad` trae la coma (iOS, según región) o el punto (Android);
        // ambos abren los centavos. `number-pad` no tiene separador en iOS.
        keyboardType={acceptsDecimals ? 'decimal-pad' : 'number-pad'}
        value={amount}
        // El valor se reformatea en cada tecla; fijar el cursor al final evita
        // que salte al inicio tras insertar los puntos de miles. Además
        // `applyMoneyTextChange` asume que se escribe y borra al final.
        selection={{ start: amount.length, end: amount.length }}
        onChangeText={(text) => onChangeAmount(applyMoneyTextChange(amount, text, amountOptions).display)}
        autoFocus
        editable={!saving}
        containerStyle={styles.field}
        accessibilityLabel="Valor del pago"
      />
      {amountAccessory}
      <Input
        label="Recibo físico (opcional)"
        placeholder="Número del recibo"
        value={receipt}
        onChangeText={onChangeReceipt}
        editable={!saving}
        containerStyle={styles.field}
        accessibilityLabel="Número de recibo físico"
      />
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Método de pago *</Text>
        <OptionPickerField
          value={paymentMethodId}
          onValueChange={onChangePaymentMethod}
          options={paymentMethods.map((method) => ({ value: method.id, label: method.name }))}
          placeholder={paymentMethodsLoading ? 'Cargando métodos…' : 'Seleccione el método'}
          modalTitle="Método de pago"
          colors={colors}
          disabled={saving || paymentMethodsLoading || paymentMethods.length === 0}
        />
        {!paymentMethodsLoading && paymentMethods.length === 0 ? (
          <Text style={[styles.fieldHint, { color: colors.error.main }]}>
            No hay métodos de pago configurados. Pídalos al administrador.
          </Text>
        ) : null}
      </View>
      <PagoSupportPicker
        visible={visible}
        supportRequired={supportRequired}
        supportFile={supportFile}
        onPickSupport={onPickSupport}
        onRemoveSupport={onRemoveSupport}
        disabled={saving}
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  balance: { ...Typography.caption },
  fieldLabel: { ...Typography.label, marginBottom: Spacing.xs },
  fieldHint: { ...Typography.caption, marginTop: Spacing.xs },
  field: { marginBottom: 0 },
  footerButton: { flex: 1 },
});
