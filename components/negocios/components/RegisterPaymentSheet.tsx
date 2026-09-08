import { useTheme } from '@/components/theme';
import { Button, Input, ModalSheet } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import type { PagoSupportLocalFile } from '@/lib/uploadPagoSupport';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type PagoSupportSource = 'camera' | 'gallery' | 'document';

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
  onPickSupport: (source: PagoSupportSource) => void;
  onRemoveSupport: () => void;
  saving: boolean;
  onSubmit: () => void;
};

const SUPPORT_SOURCES: { source: PagoSupportSource; label: string; icon: 'photo-camera' | 'photo-library' | 'attach-file' }[] = [
  { source: 'camera', label: 'Tomar foto', icon: 'photo-camera' },
  { source: 'gallery', label: 'Galería', icon: 'photo-library' },
  { source: 'document', label: 'Archivo / PDF', icon: 'attach-file' },
];

/**
 * Hoja modal para registrar un pago (valor, recibo físico y soporte).
 *
 * Las opciones de origen del soporte se muestran dentro de la propia hoja y no
 * con `Alert`/`ActionSheetIOS`: en Android `Alert.alert` solo admite 3 botones y
 * no es cancelable por defecto, así que con 4-5 opciones se perdía "Cancelar" y
 * el diálogo quedaba sin forma de cerrarse.
 */
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
  onRemoveSupport,
  saving,
  onSubmit,
}: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [choosingSupport, setChoosingSupport] = useState(false);

  useEffect(() => {
    if (!visible) setChoosingSupport(false);
  }, [visible]);

  const pickSupport = (source: PagoSupportSource) => {
    setChoosingSupport(false);
    onPickSupport(source);
  };

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
      {choosingSupport ? (
        <View style={[styles.supportOptions, { borderColor: colors.divider }]}>
          <Text style={[styles.supportTitle, { color: colors.text.secondary }]}>Soporte de pago</Text>
          {SUPPORT_SOURCES.map((item) => (
            <Button
              key={item.source}
              title={item.label}
              variant="ghost"
              size="sm"
              icon={item.icon}
              onPress={() => pickSupport(item.source)}
              disabled={saving}
              style={styles.supportOption}
            />
          ))}
          {supportFile ? (
            <Button
              title="Quitar soporte"
              variant="ghost"
              size="sm"
              icon="delete-outline"
              onPress={() => {
                setChoosingSupport(false);
                onRemoveSupport();
              }}
              disabled={saving}
              style={styles.supportOption}
              textStyle={{ color: colors.error.main }}
            />
          ) : null}
          <Button
            title="Cancelar"
            variant="outline"
            size="sm"
            onPress={() => setChoosingSupport(false)}
            accessibilityLabel="Cancelar selección de soporte"
          />
        </View>
      ) : (
        <Button
          title={supportFile ? supportFile.name : 'Adjuntar soporte (opcional)'}
          variant="outline"
          size="sm"
          icon={supportFile ? 'check-circle' : 'attach-file'}
          onPress={() => setChoosingSupport(true)}
          disabled={saving}
          accessibilityLabel={supportFile ? `Soporte adjunto: ${supportFile.name}. Cambiar` : 'Adjuntar soporte de pago'}
          textStyle={styles.supportText}
        />
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  balance: { ...Typography.caption },
  field: { marginBottom: 0 },
  footerButton: { flex: 1 },
  supportText: { flexShrink: 1 },
  supportOptions: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.control, padding: Spacing.sm, gap: Spacing.xs },
  supportTitle: { ...Typography.caption, paddingHorizontal: Spacing.xs, marginBottom: Spacing.xs },
  supportOption: { alignSelf: 'stretch', justifyContent: 'flex-start' },
});
