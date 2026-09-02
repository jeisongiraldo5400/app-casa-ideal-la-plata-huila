import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface ErrorBannerProps {
  message: string;
  /** `warning` para avisos no bloqueantes (p. ej. sin conexión). */
  tone?: 'error' | 'warning';
  icon?: IconName;
  /** Acción principal contextual, p. ej. "Escanear de nuevo". */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

/** Aviso de error en línea con acción contextual y cierre. */
export function ErrorBanner({ message, tone = 'error', icon = 'error-outline', actionLabel, onAction, onDismiss }: ErrorBannerProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const accent = tone === 'warning' ? colors.warning.main : colors.error.main;
  return (
    <View style={[styles.banner, { backgroundColor: `${accent}14`, borderColor: accent }]} accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}>
      <MaterialIcons name={icon} size={20} color={accent} />
      <Text style={[styles.text, { color: accent }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} style={({ pressed }) => [styles.action, pressed && styles.pressed]} hitSlop={6}>
          <Text style={[styles.actionText, { color: colors.primary.main }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Cerrar aviso" style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]} hitSlop={6}>
          <MaterialIcons name="close" size={18} color={colors.text.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, padding: Spacing.md },
  text: { ...Typography.caption, flex: 1, fontWeight: '600' },
  action: { justifyContent: 'center', minHeight: 32, paddingHorizontal: Spacing.xs },
  actionText: { ...Typography.bodySmallStrong },
  dismiss: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  pressed: { opacity: 0.6 },
});
