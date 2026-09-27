import { useTheme } from '@/components/theme';
import { Button, ModalSheet } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { useAttachPagoSupport } from '../infrastructure/hooks/useAttachPagoSupport';
import { PagoSupportPicker } from './PagoSupportPicker';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

type Props = {
  attach: ReturnType<typeof useAttachPagoSupport>;
  /** Hay señal: con ella se sube ya; sin ella queda en la cola del teléfono. */
  online: boolean;
};

/** Hoja «Adjuntar soporte» de un pago ya registrado (ficha del negocio y Cobros). */
export function AttachPagoSupportSheet({ attach, online }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const target = attach.target;
  const willQueue = !online || Boolean(target?.pagoIsLocal);

  return (
    <ModalSheet
      visible={attach.visible}
      onClose={attach.close}
      title="Adjuntar soporte"
      subtitle={target?.title}
      dismissable={!attach.saving}
      footer={
        <>
          <Button
            title="Cancelar"
            variant="outline"
            onPress={attach.close}
            disabled={attach.saving}
            style={styles.footerButton}
          />
          <Button
            title="Adjuntar"
            onPress={() => void attach.submit()}
            loading={attach.saving}
            disabled={!attach.file}
            style={styles.footerButton}
          />
        </>
      }>
      {willQueue ? (
        <Text style={[styles.text, { color: colors.text.secondary }]}>
          {target?.pagoIsLocal
            ? 'El pago aún no se ha enviado: el soporte se guarda en el teléfono y se sube justo después del pago.'
            : 'Sin conexión: el soporte se guarda en el teléfono y se sube al sincronizar.'}
        </Text>
      ) : null}
      <PagoSupportPicker
        visible={attach.visible}
        supportRequired={Boolean(target?.supportRequired)}
        supportFile={attach.file}
        onPickSupport={attach.pick}
        onRemoveSupport={attach.removeFile}
        disabled={attach.saving}
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  text: { ...Typography.bodySmall, marginBottom: Spacing.xs },
  footerButton: { flex: 1 },
});
