import { useTheme } from '@/components/theme';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
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

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  /** `sm` = 44 px de alto, para acciones secundarias y cabeceras. */
  size?: 'md' | 'sm';
  /** Icono a la izquierda del texto. */
  icon?: IconName;
  /** Oculta el texto y deja solo el icono (requiere pasar `icon`). */
  iconOnly?: boolean;
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
  size = 'md',
  icon,
  iconOnly = false,
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
        size === 'sm' && styles.small,
        iconOnly && (size === 'sm' ? styles.iconOnlySmall : styles.iconOnly),
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
        <>
          {icon ? (
            <MaterialIcons
              name={icon}
              size={size === 'sm' ? IconSize.sm : IconSize.md}
              color={unavailable ? colors.text.secondary : foregroundColor}
            />
          ) : null}
          {iconOnly ? null : (
            <Text style={[styles.text, size === 'sm' && styles.textSmall, { color: unavailable ? colors.text.secondary : foregroundColor }, textStyle]}>
              {title}
            </Text>
          )}
        </>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  small: {
    minHeight: 44,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  iconOnly: {
    paddingHorizontal: Spacing.md,
    gap: 0,
  },
  iconOnlySmall: {
    paddingHorizontal: Spacing.sm,
    gap: 0,
  },
  ghost: {
    minHeight: 44,
    paddingVertical: Spacing.sm,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  text: { ...Typography.button },
  textSmall: { ...Typography.bodySmallStrong },
});
