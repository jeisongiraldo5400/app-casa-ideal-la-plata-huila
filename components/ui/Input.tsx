import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Radius, Spacing, getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  rightElement?: React.ReactNode;
}

export function Input({
  label,
  error,
  containerStyle,
  rightElement,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const { isDark } = useTheme();
  const Colors = getColors(isDark);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const borderColor = error
    ? Colors.error.main
    : isFocused
      ? Colors.primary.main
      : Colors.divider;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, { color: Colors.text.primary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.inputWrapper,
          {
            borderColor,
            backgroundColor: Colors.background.paper,
          },
        ]}>
        <TextInput
          style={[
            styles.input,
            { color: Colors.text.primary },
            rightElement ? styles.inputWithRight : null,
            style,
          ]}
          placeholderTextColor={Colors.text.secondary}
          {...props}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {rightElement ? (
          <View style={styles.rightElement} pointerEvents="box-none">
            {rightElement}
          </View>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.errorText, { color: Colors.error.main }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    // Border width fijo: cambiar 1.5→2 al focus provoca re-layout
    // y en iOS el TextInput pierde el teclado / no deja escribir.
    borderWidth: 1.5,
    borderRadius: Radius.control,
    minHeight: 52,
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  inputWithRight: {
    paddingRight: 8,
  },
  rightElement: {
    paddingRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    marginTop: 6,
    fontWeight: '500',
  },
});
