import { NegocioDatePicker } from '@/components/negocios/components/NegocioDatePicker';
import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import {
  matchingMisCobrosPreset,
  misCobrosPresetRange,
  misCobrosRangeError,
  type MisCobrosPreset,
} from '@/lib/cartera/misCobros';
import { bogotaDateValue } from '@/lib/localDate';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Range = { from: string; to: string };

const PRESETS: { value: MisCobrosPreset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Últimos 7 días' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
];

type Props = {
  value: Range;
  onChange: (next: Range) => void;
};

/**
 * Rango «Desde / Hasta» a la vista, encima del total: así quien cobra sabe
 * cuánto cobró de una fecha a otra. Cualquier día pasado vale; el futuro no,
 * porque no hay cobros todavía.
 */
export function MisCobrosDateRange({ value, onChange }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const today = bogotaDateValue(new Date());
  const active = matchingMisCobrosPreset(value);
  const error = misCobrosRangeError(value);

  const end = (key: 'from' | 'to', caption: string, minDate: string | null) => (
    <View style={styles.end}>
      <Text style={[styles.caption, { color: colors.text.secondary }]}>{caption}</Text>
      <View style={styles.endRow}>
        <View style={styles.picker}>
          <NegocioDatePicker
            value={value[key]}
            onChange={(next) => onChange({ ...value, [key]: next })}
            colors={colors}
            label="Cualquier fecha"
            accessibilityLabel={`Cobros ${caption.toLowerCase()}`}
            minDate={minDate}
            maxDate={today}
          />
        </View>
        {value[key] ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quitar fecha ${caption.toLowerCase()}`}
            onPress={() => onChange({ ...value, [key]: '' })}
            hitSlop={8}
            style={styles.clear}>
            <MaterialIcons name="close" size={20} color={colors.text.secondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap} testID="mis-cobros-rango">
      <View style={styles.chips}>
        {PRESETS.map((preset) => {
          const selected = active === preset.value;
          return (
            <Pressable
              key={preset.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(misCobrosPresetRange(preset.value))}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary.main : colors.background.paper,
                  borderColor: selected ? colors.primary.main : colors.divider,
                },
              ]}>
              <Text style={{ color: selected ? colors.primary.contrastText : colors.text.primary, fontWeight: '700', fontSize: 12 }}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.ends}>
        {end('from', 'Desde', null)}
        {end('to', 'Hasta', value.from || null)}
      </View>
      {error ? <Text style={[styles.error, { color: colors.error.main }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  ends: { flexDirection: 'row', gap: Spacing.sm },
  end: { flex: 1, gap: 4 },
  caption: { ...Typography.metadata, fontWeight: '700' },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  picker: { flex: 1 },
  clear: { padding: 4 },
  error: { ...Typography.metadata },
});
