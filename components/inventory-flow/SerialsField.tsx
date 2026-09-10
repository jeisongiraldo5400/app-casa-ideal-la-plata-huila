import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_SERIAL_LENGTH, type CapturedSerial, type SerialCaptureMethod } from './serials';

interface SerialsFieldProps {
  serials: CapturedSerial[];
  /** Unidades que se van a agregar; como máximo un serial por unidad. */
  quantity: number;
  checking: boolean;
  error: string | null;
  /** Texto de ayuda bajo el título (cambia entre entradas y salidas). */
  hint: string;
  /** Salidas: muestra si cada serial quedó verificado contra las entradas. */
  showVerification?: boolean;
  /** Devuelve true si el serial quedó agregado (entonces se limpia el campo). */
  onAdd: (raw: string, method: SerialCaptureMethod) => Promise<boolean>;
  onRemove: (index: number) => void;
  onScanPress: () => void;
}

/** Captura opcional del serial de fábrica de cada unidad (entradas y salidas). */
export function SerialsField({
  serials,
  quantity,
  checking,
  error,
  hint,
  showVerification = false,
  onAdd,
  onRemove,
  onScanPress,
}: SerialsFieldProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [text, setText] = useState('');
  const full = serials.length >= quantity;
  const canSubmit = text.trim().length > 0 && !checking && !full;

  const submit = async () => {
    if (!canSubmit) return;
    if (await onAdd(text, 'manual')) setText('');
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Seriales (opcional)</Text>
        <Text style={[styles.counter, { color: colors.text.secondary }]}>{serials.length} de {quantity}</Text>
      </View>
      <Text style={[styles.hint, { color: colors.text.secondary }]}>{hint}</Text>

      <View style={styles.inputRow}>
        <Input
          value={text}
          onChangeText={setText}
          placeholder={full ? 'Ya hay un serial por unidad' : 'Serial del aparato'}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          editable={!checking && !full}
          maxLength={MAX_SERIAL_LENGTH}
          containerStyle={styles.inputContainer}
          accessibilityLabel="Serial del aparato"
          rightElement={
            <IconButton icon="qr-code-scanner" onPress={onScanPress} disabled={checking || full} accessibilityLabel="Escanear serial con la cámara" />
          }
        />
        <Button title="Agregar" size="sm" variant="outline" onPress={() => void submit()} disabled={!canSubmit} loading={checking} />
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.error.main }]} accessibilityLiveRegion="assertive">{error}</Text>
      ) : null}

      {serials.length > 0 ? (
        <View style={styles.chips}>
          {serials.map((serial, index) => {
            const verification = showVerification && serial.verified !== undefined
              ? serial.verified
                ? { icon: 'verified' as const, label: 'Verificado en entradas', color: colors.success.main }
                : { icon: 'help-outline' as const, label: 'No registrado en entradas', color: colors.warning.main }
              : null;
            return (
              <View key={serial.normalized} style={[styles.chip, { backgroundColor: colors.surface.muted, borderColor: colors.divider }]}>
                <MaterialIcons name={serial.method === 'scan' ? 'qr-code' : 'keyboard'} size={16} color={colors.text.secondary} />
                <View style={styles.chipCopy}>
                  <Text style={[styles.chipText, { color: colors.text.primary }]}>{serial.serial}</Text>
                  {verification ? (
                    <View style={styles.verificationRow} accessible accessibilityLabel={verification.label}>
                      <MaterialIcons name={verification.icon} size={13} color={verification.color} />
                      <Text style={[styles.verificationText, { color: verification.color }]}>{verification.label}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => onRemove(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar serial ${serial.serial}`}
                  hitSlop={8}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <MaterialIcons name="close" size={18} color={colors.text.secondary} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { ...Typography.bodySmallStrong },
  counter: { ...Typography.metadata },
  hint: { ...Typography.metadata },
  inputRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  inputContainer: { flex: 1, marginBottom: 0 },
  error: { ...Typography.metadata, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, flexDirection: 'row', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  chipCopy: { gap: 1 },
  chipText: { ...Typography.bodySmallStrong },
  verificationRow: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  verificationText: { ...Typography.metadata, fontSize: 11, lineHeight: 14 },
  pressed: { opacity: 0.6 },
});
