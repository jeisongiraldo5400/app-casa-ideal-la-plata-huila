import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface FlowMetricProps {
  label: string;
  value: number | string;
  /** Resalta el valor con el color primario. */
  primary?: boolean;
  /** Tono de advertencia: fondo y valor en `warning` (p. ej. "ya agregado" > 0). */
  warning?: boolean;
}

/** Tile compacto etiqueta/valor para filas de métricas dentro de tarjetas de escaneo. */
export function FlowMetric({ label, value, primary, warning }: FlowMetricProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const valueColor = warning ? colors.warning.main : primary ? colors.primary.main : colors.text.primary;
  return (
    <View
      style={[styles.metric, { backgroundColor: warning ? `${colors.warning.main}14` : colors.background.default }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { alignItems: 'center', borderRadius: Radius.chip, flex: 1, padding: Spacing.sm },
  label: { ...Typography.label, fontSize: 10, letterSpacing: 0.4 },
  value: { ...Typography.headline, fontSize: 18, lineHeight: 22, marginTop: 2 },
});
