import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface FlowStepperProps {
  labels: string[];
  /** Paso activo, empezando en 1. */
  current: number;
}

/** Indicador de pasos del formulario de configuración. Los pasos son una secuencia real. */
export function FlowStepper({ labels, current }: FlowStepperProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={styles.stepper} accessibilityRole="progressbar" accessibilityLabel={`Paso ${current} de ${labels.length}: ${labels[current - 1] ?? ''}`} accessibilityValue={{ min: 1, max: labels.length, now: current }}>
      {labels.map((label, index) => {
        const stepNumber = index + 1;
        const active = stepNumber === current;
        const complete = stepNumber < current;
        return (
          <View key={label} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: active || complete ? colors.primary.main : colors.divider }]}>
              <Text style={[styles.number, { color: active || complete ? colors.primary.contrastText : colors.text.secondary }]}>{complete ? '✓' : stepNumber}</Text>
            </View>
            <Text style={[styles.label, { color: active ? colors.primary.main : colors.text.secondary }]} numberOfLines={1}>{label}</Text>
            {index < labels.length - 1 ? <View style={[styles.connector, { backgroundColor: complete ? colors.primary.main : colors.divider }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xxl },
  item: { alignItems: 'center', flex: 1, position: 'relative' },
  dot: { alignItems: 'center', borderRadius: Radius.pill, height: 28, justifyContent: 'center', width: 28, zIndex: 1 },
  number: { ...Typography.bodySmallStrong, fontSize: 13 },
  label: { ...Typography.metadata, fontWeight: '600', marginTop: 6 },
  connector: { height: 2, left: '50%', position: 'absolute', right: '-50%', top: 13 },
});
