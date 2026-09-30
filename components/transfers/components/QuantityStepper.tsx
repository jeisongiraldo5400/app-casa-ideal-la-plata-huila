import { useTheme } from '@/components/theme';
import { IconButton } from '@/components/ui/IconButton';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { parseWholeQuantityText, quantityFromText, syncQuantityDraft } from '@/lib/quantityInput';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { clampQuantity } from '../utils/transferRules';

type Props = {
  label: string;
  /** Nombre del producto para los textos de accesibilidad. */
  productName: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

/**
 * Cantidad por línea con − / + y campo editable (sin escáner). Lo escrito que
 * no es un entero se deja a la vista en rojo (ver lib/quantityInput); lo que
 * pasa del máximo se lleva al máximo, que es lo que el servidor permite.
 */
export function QuantityStepper({ label, productName, value, max, onChange, disabled }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [text, setText] = useState(() => String(value));
  const parsed = parseWholeQuantityText(text);

  useEffect(() => {
    setText((previous) => syncQuantityDraft(previous, value));
  }, [value]);

  const setFromControl = (next: number) => {
    const clamped = clampQuantity(next, max);
    setText(String(clamped));
    onChange(clamped);
  };

  const onChangeText = (next: string) => {
    const nextParsed = parseWholeQuantityText(next);
    const quantity = quantityFromText(nextParsed);
    if (nextParsed.status === 'whole' && quantity > max) {
      setFromControl(max);
      return;
    }
    setText(next);
    onChange(quantity);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: colors.text.primary }]}>{label}</Text>
          <Text style={[styles.hint, { color: colors.text.secondary }]}>Máximo {max}</Text>
        </View>
        <IconButton
          icon="remove"
          onPress={() => setFromControl(value - 1)}
          disabled={disabled || value <= 0}
          accessibilityLabel={`Quitar una unidad: ${label} de ${productName}`}
        />
        <TextInput
          value={text}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          editable={!disabled}
          selectTextOnFocus
          accessibilityLabel={`${label} de ${productName}`}
          style={[
            styles.input,
            {
              color: colors.text.primary,
              borderColor: parsed.status === 'invalid' ? colors.error.main : colors.divider,
              backgroundColor: colors.background.paper,
            },
          ]}
        />
        <IconButton
          icon="add"
          onPress={() => setFromControl(value + 1)}
          disabled={disabled || value >= max}
          accessibilityLabel={`Agregar una unidad: ${label} de ${productName}`}
        />
      </View>
      {parsed.status === 'invalid' ? (
        <Text style={[styles.error, { color: colors.error.main }]}>{parsed.error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  copy: { flex: 1 },
  label: { ...Typography.bodySmallStrong },
  hint: { ...Typography.metadata },
  input: {
    width: 64,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    textAlign: 'center',
    ...Typography.bodyStrong,
  },
  error: { ...Typography.metadata },
});
