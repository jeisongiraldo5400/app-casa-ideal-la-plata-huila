import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NegocioDatePicker } from '@/components/negocios/components/NegocioDatePicker';
import { Radius, Spacing, Typography, type getColors } from '@/constants/theme';
import { DUE_PRESETS, duePresetRange, dueRangeError, matchingDuePreset } from '@/lib/cartera/carteraFilters';

type Props = {
  dueFrom: string;
  dueTo: string;
  onChange: (range: { dueFrom: string; dueTo: string }) => void;
  colors: ReturnType<typeof getColors>;
};

/**
 * Rango de vencimiento de la cartera: «Desde» y «Hasta» independientes, cada
 * uno opcional y con su «x», más atajos. Cualquier fecha vale, pasada o futura:
 * antes se usaba el calendario del negocio, que bloquea los días anteriores a
 * hoy (un negocio no se pacta en el pasado) y dejaba la cartera vencida fuera
 * de alcance.
 */
export function CarteraDateRangeField({ dueFrom, dueTo, onChange, colors }: Props) {
  const error = dueRangeError(dueFrom, dueTo);
  const preset = matchingDuePreset(dueFrom, dueTo);

  const end = (key: 'dueFrom' | 'dueTo', label: string, extra: { minDate: string | null }) => {
    const value = key === 'dueFrom' ? dueFrom : dueTo;
    return (
      <View style={styles.end}>
        <Text style={[styles.caption, { color: colors.text.secondary }]}>{label}</Text>
        <View style={styles.endRow}>
          <View style={styles.picker}>
            <NegocioDatePicker
              value={value}
              onChange={(next) => onChange({ dueFrom, dueTo, [key]: next })}
              colors={colors}
              label="Cualquier fecha"
              accessibilityLabel={`Vence ${label.toLowerCase()}`}
              minDate={extra.minDate}
            />
          </View>
          {value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar fecha ${label.toLowerCase()}`}
              onPress={() => onChange({ dueFrom, dueTo, [key]: '' })}
              hitSlop={8}
              style={styles.clear}>
              <MaterialIcons name="close" size={20} color={colors.text.secondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {DUE_PRESETS.map((item) => {
          const selected = preset === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(duePresetRange(item.id))}
              style={[
                styles.chip,
                { borderColor: selected ? colors.primary.main : colors.divider, backgroundColor: selected ? colors.primary.main : colors.background.paper },
              ]}>
              <Text style={[styles.chipText, { color: selected ? colors.primary.contrastText : colors.text.primary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* «Desde» sin límite; «Hasta» empieza en «Desde» si ya hay uno. */}
      {end('dueFrom', 'Desde', { minDate: null })}
      {end('dueTo', 'Hasta', { minDate: dueFrom || null })}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error.main }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: Spacing.md, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  chipText: { ...Typography.bodySmallStrong },
  end: { gap: 4 },
  caption: { ...Typography.caption },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  picker: { flex: 1 },
  clear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  error: { ...Typography.caption, fontWeight: '700' },
});
