import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface ListCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'elevated' | 'outlined';
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tarjeta para filas de lista (negocios, cuotas, pagos). Con `onPress` se
 * vuelve pulsable con feedback; sin él es un contenedor estático.
 */
export function ListCard({ children, onPress, variant = 'outlined', accessibilityLabel, disabled, style }: ListCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const surface = { backgroundColor: colors.background.paper, borderColor: colors.divider };

  if (!onPress) {
    return <View style={[styles.card, variant === 'elevated' && styles.elevated, surface, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.card, variant === 'elevated' && styles.elevated, surface, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.lg, gap: Spacing.sm },
  elevated: { ...Shadows.card },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
