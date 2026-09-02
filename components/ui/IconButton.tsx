import { useTheme } from '@/components/theme';
import { Radius, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  backgroundColor?: string;
  size?: number;
  /** Texto corto bajo el icono (PDF, Imprimir). */
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color,
  backgroundColor,
  size = 22,
  label,
  disabled,
  style,
}: IconButtonProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        label ? styles.withLabel : null,
        { backgroundColor: backgroundColor ?? colors.background.paper, borderColor: colors.divider },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      <MaterialIcons name={icon} size={size} color={color ?? colors.text.primary} />
      {label ? <Text style={[styles.label, { color: color ?? colors.text.primary }]} numberOfLines={1}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withLabel: { width: undefined, minWidth: 52, height: undefined, minHeight: 48, paddingHorizontal: 6, paddingVertical: 4, gap: 1 },
  label: { ...Typography.label, letterSpacing: 0.2, fontSize: 10 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
