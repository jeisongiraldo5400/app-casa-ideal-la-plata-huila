import { useTheme } from '@/components/theme';
import { Button, ModalSheet } from '@/components/ui';
import { Typography, getColors } from '@/constants/theme';
import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  summary: string;
  confirmLabel: string;
  submitting: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Resumen antes de confirmar la salida de productos, una recepción o una devolución. */
export function ConfirmTransferSheet({ visible, title, summary, confirmLabel, submitting, disabled, onConfirm, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { height } = useWindowDimensions();
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={title}
      dismissable={!submitting}
      footer={
        <>
          <Button title="Volver" variant="outline" onPress={onClose} disabled={submitting} style={styles.button} />
          <Button
            title={confirmLabel}
            onPress={onConfirm}
            loading={submitting}
            disabled={submitting || disabled}
            style={styles.button}
          />
        </>
      }
    >
      {/* Con un error del servidor el resumen crece: que se pueda bajar y los botones sigan a la vista. */}
      <ScrollView style={{ maxHeight: Math.max(height * 0.5, 200) }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.summary, { color: colors.text.primary }]}>{summary}</Text>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  summary: { ...Typography.body },
  button: { flex: 1 },
});
