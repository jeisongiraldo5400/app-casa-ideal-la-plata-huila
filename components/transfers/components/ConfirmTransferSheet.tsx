import { useTheme } from '@/components/theme';
import { Button, ModalSheet } from '@/components/ui';
import { Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

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

/** Resumen antes de confirmar un despacho, una recepción o una devolución. */
export function ConfirmTransferSheet({ visible, title, summary, confirmLabel, submitting, disabled, onConfirm, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
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
      <Text style={[styles.summary, { color: colors.text.primary }]}>{summary}</Text>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  summary: { ...Typography.body },
  button: { flex: 1 },
});
