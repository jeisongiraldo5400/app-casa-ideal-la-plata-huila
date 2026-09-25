import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';

/** Espera a que la persona deje de teclear antes de consultar el servidor. */
const DEBOUNCE_MS = 350;

type Props = {
  value: string;
  onChange: (value: string) => void;
  colors: any;
  placeholder?: string;
  accessibilityLabel?: string;
};

/**
 * Buscador de la cartera. Se declara a nivel de módulo y guarda lo tecleado en
 * su propio estado: un campo definido dentro del render de la pantalla se
 * remonta en cada tecla y pierde el foco.
 */
export function CarteraSearchField({ value, onChange, colors, placeholder, accessibilityLabel }: Props) {
  const [text, setText] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cambios que no vienen del teclado (limpiar, un enlace directo). Se compara
  // sin espacios en los extremos porque la pantalla recibe el término recortado:
  // comparar tal cual borraba el espacio de «maria » a mitad de escribir.
  useEffect(() => {
    setText((current) => (current.trim() === value ? current : value));
  }, [value]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function handleChange(next: string) {
    setText(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onChange(next.trim()), DEBOUNCE_MS);
  }

  function clear() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setText('');
    onChange('');
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <MaterialIcons name="search" size={20} color={colors.text.secondary} />
      <TextInput
        style={[styles.input, { color: colors.text.primary }]}
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder || 'Cédula, cliente o número de negocio'}
        placeholderTextColor={colors.text.secondary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel || 'Buscar cuotas'}
      />
      {text.length > 0 && (
        <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda">
          <MaterialIcons name="close" size={20} color={colors.text.secondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: Spacing.sm },
});
