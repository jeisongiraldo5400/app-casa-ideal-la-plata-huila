import { useTheme } from '@/components/theme';
import { Radius, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

interface SearchFieldProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (value: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
}

export function SearchField({ value, onChangeText, containerStyle, placeholder = 'Buscar…', ...props }: SearchFieldProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={[styles.container, { backgroundColor: colors.background.paper, borderColor: colors.divider }, containerStyle]}>
      <MaterialIcons name="search" size={22} color={colors.text.secondary} />
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.secondary}
        style={[styles.input, { color: colors.text.primary }]}
      />
      {value ? <Pressable accessibilityLabel="Limpiar búsqueda" hitSlop={8} onPress={() => onChangeText('')}><MaterialIcons name="close" size={20} color={colors.text.secondary} /></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, borderWidth: 1, borderRadius: Radius.control },
  input: { flex: 1, minHeight: 50, fontSize: 15 },
});
