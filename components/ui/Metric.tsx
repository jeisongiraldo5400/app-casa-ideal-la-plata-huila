import { useTheme } from '@/components/theme';
import { Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'error';

interface MetricProps {
  label: string;
  value: string | number;
  tone?: Tone;
  align?: 'left' | 'right' | 'center';
  /** Sobre fondos de marca (hero): usa `colors.onPrimary`. */
  inverse?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

/** Par etiqueta/valor para tarjetas y héroes (VALOR $120.000). */
export function Metric({ label, value, tone = 'default', align = 'left', inverse, size = 'sm', style }: MetricProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const labelColor = inverse ? colors.onPrimary.textMuted : colors.text.secondary;
  const valueColor = inverse
    ? colors.onPrimary.text
    : tone === 'default'
      ? colors.text.primary
      : tone === 'primary'
        ? colors.primary.main
        : colors[tone].main;
  const textAlign = align;

  return (
    <View style={[styles.container, align === 'right' && styles.right, align === 'center' && styles.center, style]}>
      <Text style={[styles.label, { color: labelColor, textAlign }]} numberOfLines={1}>{label}</Text>
      <Text style={[size === 'md' ? styles.valueMd : styles.valueSm, { color: valueColor, textAlign }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  right: { alignItems: 'flex-end' },
  center: { alignItems: 'center' },
  label: { ...Typography.label },
  valueSm: { ...Typography.bodySmallStrong, fontWeight: '800' },
  valueMd: { ...Typography.bodyStrong, fontWeight: '800' },
});
