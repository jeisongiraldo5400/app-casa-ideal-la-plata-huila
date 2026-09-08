import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface StatCardProps {
  label: string;
  value: string | number;
  icon: IconName;
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function StatCard({ label, value, icon, color, accessibilityLabel, style }: StatCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const accent = color ?? colors.primary.main;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }, style]}>
      <View style={[styles.icon, { backgroundColor: `${accent}16` }]}><MaterialIcons name={icon} size={20} color={accent} /></View>
      <Text style={[styles.value, { color: colors.text.primary }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 126, borderWidth: 1, borderRadius: Radius.card, padding: Spacing.lg },
  icon: { width: 38, height: 38, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  value: { fontSize: 27, lineHeight: 31, fontWeight: '800' },
  label: { ...Typography.metadata, fontWeight: '400', marginTop: 3 },
});
