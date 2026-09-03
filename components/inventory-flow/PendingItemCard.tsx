import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlowMetric } from './FlowMetric';

export type PendingTone = 'complete' | 'partial' | 'pending';

interface PendingItemCardProps {
  name: string;
  meta: string;
  tone: PendingTone;
  expanded: boolean;
  metrics: { label: string; value: number; primary?: boolean }[];
  onPress: () => void;
  /** Nota por producto (p. ej. indicaciones de quien lo solicitó). Siempre visible si existe. */
  note?: string | null;
}

/** Línea de la orden todavía por recibir/entregar; se expande para ver el detalle. */
export function PendingItemCard({ name, meta, tone, expanded, metrics, onPress, note }: PendingItemCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const accent = tone === 'complete' ? colors.success.main : tone === 'partial' ? colors.warning.main : colors.text.secondary;
  const icon = tone === 'complete' ? 'check-circle' : tone === 'partial' ? 'pending' : 'inventory-2';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.background.paper, borderColor: expanded ? accent : colors.divider }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={note ? `${name}, ${meta}. Nota: ${note}` : `${name}, ${meta}`}
      accessibilityHint={expanded ? 'Toca para ocultar el detalle' : 'Toca para ver el detalle'}
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={icon} size={21} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>{name}</Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={2}>{meta}</Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={23} color={colors.text.secondary} />
      </View>
      {note ? (
        <View style={[styles.noteBox, { backgroundColor: `${colors.warning.main}14`, borderColor: `${colors.warning.main}55` }]}>
          <MaterialIcons name="sticky-note-2" size={15} color={colors.warning.main} style={styles.noteIcon} />
          <Text style={[styles.noteText, { color: colors.text.primary }]} numberOfLines={expanded ? undefined : 3}>
            <Text style={[styles.noteLabel, { color: colors.warning.main }]}>Nota: </Text>
            {note}
          </Text>
        </View>
      ) : null}
      {expanded ? (
        <View style={styles.metrics}>
          {metrics.map((metric) => (
            <FlowMetric key={metric.label} label={metric.label} value={metric.value} primary={metric.primary} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.md, minHeight: 66, padding: Spacing.md },
  pressed: { opacity: 0.85 },
  row: { alignItems: 'center', flexDirection: 'row' },
  icon: { alignItems: 'center', borderRadius: Radius.control, height: 42, justifyContent: 'center', width: 42 },
  copy: { flex: 1, marginLeft: Spacing.md },
  name: { ...Typography.bodySmallStrong, fontWeight: '800' },
  meta: { ...Typography.metadata, fontSize: 11, lineHeight: 16, marginTop: 3 },
  metrics: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  noteBox: { alignItems: 'flex-start', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', marginTop: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  noteIcon: { marginRight: 6, marginTop: 1 },
  noteText: { ...Typography.metadata, flex: 1, fontSize: 12, lineHeight: 17 },
  noteLabel: { fontWeight: '800' },
});
