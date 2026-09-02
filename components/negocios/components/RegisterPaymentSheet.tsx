import { useTheme } from '@/components/theme';
import { Button, Input, ModalSheet } from '@/components/ui';
import { Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import type { PagoSupportLocalFile } from '@/lib/uploadPagoSupport';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  subtitle: string;
  pendingBalance: number;
  /** Valor ya formateado con puntos de miles. */
  amount: string;
  onChangeAmount: (raw: string) => void;
  receipt: string;
  onChangeReceipt: (value: string) => void;
  supportFile: PagoSupportLocalFile | null;
  onPickSupport: () => void;
  saving: boolean;
  onSubmit: () => void;
};

/** Hoja modal para registrar un pago (valor, recibo físico y soporte). */
export function RegisterPaymentSheet({
  visible,
  onClose,
  subtitle,
  pendingBalance,
  amount,
  onChangeAmount,
  receipt,
  onChangeReceipt,
  supportFile,
  onPickSupport,
  saving,
  onSubmit,
}: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

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
          <Button title="Guardar pago" onPress={onSubmit} loading={saving} style={styles.footerButton} />
        </>
      }>
      <Text style={[styles.balance, { color: colors.text.secondary }]}>
        Saldo pendiente: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{formatCOP(pendingBalance)}</Text>
      </Text>
      <Input
        label="Valor del pago"
        placeholder="0"
        keyboardType="number-pad"
        value={amount}
        // El valor se reformatea en cada tecla; fijar el cursor al final evita
        // que salte al inicio tras insertar los puntos de miles.
        selection={{ start: amount.length, end: amount.length }}
        onChangeText={onChangeAmount}
        autoFocus
        editable={!saving}
        containerStyle={styles.field}
        accessibilityLabel="Valor del pago"
      />
      <Input
        label="Recibo físico (opcional)"
        placeholder="Número del recibo"
        value={receipt}
        onChangeText={onChangeReceipt}
        editable={!saving}
        containerStyle={styles.field}
        accessibilityLabel="Número de recibo físico"
      />
      <Button
        title={supportFile ? supportFile.name : 'Adjuntar soporte (opcional)'}
        variant="outline"
        size="sm"
        icon={supportFile ? 'check-circle' : 'attach-file'}
        onPress={onPickSupport}
        disabled={saving}
        accessibilityLabel={supportFile ? `Soporte adjunto: ${supportFile.name}. Cambiar` : 'Adjuntar soporte de pago'}
        textStyle={styles.supportText}
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  balance: { ...Typography.caption },
  field: { marginBottom: 0 },
  footerButton: { flex: 1 },
  supportText: { flexShrink: 1 },
});
