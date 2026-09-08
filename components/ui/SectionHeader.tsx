import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

interface SectionHeaderProps {
  title: string;
  /** Texto corto a la derecha (conteo, estado). Se ignora si hay `action`. */
  hint?: string;
  /** Control a la derecha (botón, chip). */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Título de sección con pista o acción alineada a la derecha. */
export function SectionHeader({ title, hint, action, style }: SectionHeaderProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={[styles.container, style]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
        {title}
      </Text>
      {action ?? (hint ? <Text style={[styles.hint, { color: colors.text.secondary }]}>{hint}</Text> : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, minHeight: 28 },
  title: { ...Typography.section, flexShrink: 1 },
  hint: { ...Typography.metadata },
});
