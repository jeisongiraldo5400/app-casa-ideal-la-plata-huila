import { useTheme } from '@/components/theme';
import { IconButton } from '@/components/ui/IconButton';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface SessionProgressHeaderProps {
  title: string;
  detail: string;
  /** null cuando no hay orden (entrada manual): se muestra `manualHint` en vez de la barra. */
  percentage: number | null;
  /** Texto bajo la barra a la izquierda, p. ej. "4 de 12 escaneadas". */
  progressLabel: string;
  /** Texto bajo la barra a la derecha, p. ej. "8 pendientes". */
  remainingLabel: string;
  manualHint?: string;
  backLabel: string;
  onBack: () => void;
}

/** Cabecera de la sesión de escaneo: destino, avance sobre la orden y botón para volver. */
export function SessionProgressHeader({
  title,
  detail,
  percentage,
  progressLabel,
  remainingLabel,
  manualHint,
  backLabel,
  onBack,
}: SessionProgressHeaderProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const width = percentage === null ? 0 : Math.min(Math.max(percentage, 0), 100);
  return (
    <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <View style={styles.row}>
        <IconButton icon="arrow-back" onPress={onBack} accessibilityLabel={backLabel} backgroundColor={colors.surface.muted} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.detail, { color: colors.text.secondary }]} numberOfLines={1}>{detail}</Text>
        </View>
        {percentage !== null ? (
          <View style={[styles.pill, { backgroundColor: `${colors.primary.main}16` }]}>
            <Text style={[styles.pillText, { color: colors.primary.main }]}>{Math.round(width)}%</Text>
          </View>
        ) : null}
      </View>
      {percentage !== null ? (
        <>
          <View
            style={[styles.track, { backgroundColor: colors.divider }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Avance de la orden"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(width) }}
          >
            <View style={[styles.fill, { backgroundColor: colors.primary.main, width: `${width}%` }]} />
          </View>
          <View style={styles.labels}>
            <Text style={[styles.label, { color: colors.text.secondary }]}>{progressLabel}</Text>
            <Text style={[styles.labelStrong, { color: colors.text.primary }]}>{remainingLabel}</Text>
          </View>
        </>
      ) : manualHint ? (
        <Text style={[styles.hint, { color: colors.text.secondary }]}>{manualHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.lg, padding: Spacing.lg, ...Shadows.card },
  row: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  copy: { flex: 1 },
  title: { ...Typography.bodyStrong, fontSize: 17, lineHeight: 22 },
  detail: { ...Typography.metadata, marginTop: 2 },
  pill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  pillText: { ...Typography.bodySmallStrong, fontSize: 13 },
  track: { borderRadius: 4, height: 8, marginTop: Spacing.lg, overflow: 'hidden' },
  fill: { height: '100%' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  label: { ...Typography.metadata },
  labelStrong: { ...Typography.metadata, fontWeight: '700' },
  hint: { ...Typography.metadata, marginTop: Spacing.md },
});
