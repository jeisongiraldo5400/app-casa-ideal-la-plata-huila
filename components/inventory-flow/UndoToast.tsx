import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface UndoToastProps {
  visible: boolean;
  message: string;
  actionLabel?: string;
  /** Distancia desde abajo para no tapar el pie fijo. */
  bottomOffset: number;
  onAction: () => void;
}

/** Aviso temporal con acción de deshacer (p. ej. tras quitar un producto). */
export function UndoToast({ visible, message, actionLabel = 'Deshacer', bottomOffset, onAction }: UndoToastProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (!visible) return null;
  return (
    <View style={[styles.toast, { backgroundColor: colors.navigation.background, bottom: bottomOffset }]} accessibilityLiveRegion="polite" pointerEvents="box-none">
      <Text style={[styles.text, { color: colors.onPrimary.text }]} numberOfLines={2}>{message}</Text>
      <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} style={({ pressed }) => [styles.action, { backgroundColor: colors.onPrimary.chipBg }, pressed && styles.pressed]}>
        <Text style={[styles.actionText, { color: colors.onPrimary.text }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', gap: Spacing.md, left: Spacing.lg, padding: Spacing.md, position: 'absolute', right: Spacing.lg, zIndex: 30, ...Shadows.floating },
  text: { ...Typography.bodySmall, flex: 1 },
  action: { borderRadius: Radius.chip, justifyContent: 'center', minHeight: 40, paddingHorizontal: Spacing.md },
  actionText: { ...Typography.bodySmallStrong },
  pressed: { opacity: 0.7 },
});
