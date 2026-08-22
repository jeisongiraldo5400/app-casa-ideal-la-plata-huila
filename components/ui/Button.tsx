import { useTheme } from '@/components/theme';
import { Radius, Spacing, getColors } from '@/constants/theme';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const unavailable = disabled || loading;
  const backgroundColor =
    variant === 'primary'
      ? colors.primary.main
      : variant === 'secondary'
        ? colors.secondary.main
        : variant === 'destructive'
          ? colors.error.main
          : 'transparent';
  const foregroundColor =
    variant === 'outline' || variant === 'ghost'
      ? colors.primary.main
      : colors.primary.contrastText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      onPress={onPress}
      disabled={unavailable}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor },
        variant === 'outline' && { borderColor: colors.primary.main, borderWidth: 1.5 },
        variant === 'ghost' && styles.ghost,
        unavailable && { backgroundColor: colors.divider, opacity: 0.58 },
        pressed && !unavailable && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          testID="activity-indicator"
          color={variant === 'outline' || variant === 'ghost' ? colors.primary.main : colors.primary.contrastText}
        />
      ) : (
        <Text style={[styles.text, { color: unavailable ? colors.text.secondary : foregroundColor }, textStyle]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    minHeight: 44,
    paddingVertical: Spacing.sm,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  text: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
});
