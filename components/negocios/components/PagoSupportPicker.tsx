import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import type { PagoSupportSource } from '@/lib/pickPagoSupportFile';
import type { PagoSupportLocalFile } from '@/lib/uploadPagoSupport';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type { PagoSupportSource };

type Props = {
  /** Al ocultarse la hoja que lo contiene se cierra el menú de origen. */
  visible?: boolean;
  /** El método elegido requiere adjuntar el soporte (p. ej. consignación). */
  supportRequired?: boolean;
  supportFile: PagoSupportLocalFile | null;
  onPickSupport: (source: PagoSupportSource) => void;
  onRemoveSupport: () => void;
  disabled?: boolean;
};

const SUPPORT_SOURCES: { source: PagoSupportSource; label: string; icon: 'photo-camera' | 'photo-library' | 'attach-file' }[] = [
  { source: 'camera', label: 'Tomar foto', icon: 'photo-camera' },
  { source: 'gallery', label: 'Galería', icon: 'photo-library' },
  { source: 'document', label: 'Archivo / PDF', icon: 'attach-file' },
];

/**
 * Selector del soporte de un pago (cámara, galería o PDF). Lo usan el cobro,
 * el pronto pago y «Adjuntar soporte» de un pago ya registrado.
 *
 * Las opciones de origen se muestran en línea y no con `Alert`/`ActionSheetIOS`:
 * en Android `Alert.alert` solo admite 3 botones y no es cancelable por
 * defecto, así que con 4-5 opciones se perdía "Cancelar" y el diálogo quedaba
 * sin forma de cerrarse.
 */
export function PagoSupportPicker({
  visible = true,
  supportRequired = false,
  supportFile,
  onPickSupport,
  onRemoveSupport,
  disabled = false,
}: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [choosingSupport, setChoosingSupport] = useState(false);

  useEffect(() => {
    if (!visible) setChoosingSupport(false);
  }, [visible]);

  const missingRequiredSupport = supportRequired && !supportFile;

  const pickSupport = (source: PagoSupportSource) => {
    setChoosingSupport(false);
    onPickSupport(source);
  };

  if (choosingSupport) {
    return (
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
            disabled={disabled}
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
            disabled={disabled}
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
    );
  }

  return (
    <View>
      <Button
        title={
          supportFile
            ? supportFile.name
            : supportRequired
              ? 'Adjuntar soporte (obligatorio)'
              : 'Adjuntar soporte (opcional)'
        }
        variant="outline"
        size="sm"
        icon={supportFile ? 'check-circle' : 'attach-file'}
        onPress={() => setChoosingSupport(true)}
        disabled={disabled}
        accessibilityLabel={supportFile ? `Soporte adjunto: ${supportFile.name}. Cambiar` : 'Adjuntar soporte de pago'}
        textStyle={styles.supportText}
      />
      {missingRequiredSupport ? (
        <Text style={[styles.fieldHint, { color: colors.error.main }]}>
          Este método de pago requiere adjuntar el soporte (foto o PDF del comprobante).
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldHint: { ...Typography.caption, marginTop: Spacing.xs },
  supportText: { flexShrink: 1 },
  supportOptions: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.control, padding: Spacing.sm, gap: Spacing.xs },
  supportTitle: { ...Typography.caption, paddingHorizontal: Spacing.xs, marginBottom: Spacing.xs },
  supportOption: { alignSelf: 'stretch', justifyContent: 'flex-start' },
});
