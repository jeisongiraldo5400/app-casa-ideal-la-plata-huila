import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
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
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    // Border width fijo: cambiar 1.5→2 al focus provoca re-layout
    // y en iOS el TextInput pierde el teclado / no deja escribir.
    borderWidth: 1.5,
    borderRadius: 12,
    minHeight: 52,
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
