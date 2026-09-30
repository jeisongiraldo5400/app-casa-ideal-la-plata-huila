import { Input } from '@/components/ui';
import { StyleSheet } from 'react-native';
import React from 'react';
import { parseSerialsText } from '../utils/transferRules';

type Props = {
  label: string;
  productName: string;
  value: string;
  expected: number;
  onChange: (value: string) => void;
  editable?: boolean;
};

/**
 * Seriales escritos a mano (sin escáner): uno por renglón o separados por
 * coma. El contador ayuda a ver si falta alguno antes de confirmar.
 */
export function SerialsTextField({ label, productName, value, expected, onChange, editable = true }: Props) {
  const count = parseSerialsText(value).length;
  return (
    <Input
      label={`${label} (${count} de ${expected})`}
      value={value}
      onChangeText={onChange}
      placeholder="Un serial por renglón"
      autoCapitalize="characters"
      autoCorrect={false}
      multiline
      editable={editable}
      accessibilityLabel={`${label} de ${productName}`}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 72, textAlignVertical: 'top' },
});
