import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NegocioDatePicker } from '@/components/negocios/components/NegocioDatePicker';
import type { ThemeColors } from '@/constants/theme';
import { addDaysToDateValue, routeDateError } from '@/lib/collection-routes/routeDates';

type Props = {
  value: string;
  onChange: (value: string) => void;
  today: string;
  /** Días que ya tienen una ruta viva del gestor. */
  taken: Set<string>;
  colors: ThemeColors;
};

/** «¿Para qué día es la ruta?»: hoy, mañana u otra fecha futura. */
export function RouteDateSelector({ value, onChange, today, taken, colors }: Props) {
  const tomorrow = addDaysToDateValue(today, 1);
  const options = [
    { key: 'hoy', label: 'Hoy', date: today },
    { key: 'manana', label: 'Mañana', date: tomorrow },
  ];
  const isOther = value !== today && value !== tomorrow;
  const error = routeDateError(value, today, taken);
  return (
    <View style={styles.wrap} testID="route-date-selector">
      <Text style={[styles.title, { color: colors.text.secondary }]}>Fecha de la ruta</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const active = value === option.date;
          const busy = taken.has(option.date);
          return (
            <TouchableOpacity
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={busy ? `${option.label} (ya tiene ruta)` : option.label}
              onPress={() => onChange(option.date)}
              style={[
                styles.chip,
                { backgroundColor: active ? colors.primary.main : colors.background.paper, borderColor: colors.divider },
              ]}>
              <Text style={{ color: active ? '#fff' : busy ? colors.text.disabled : colors.text.secondary, fontWeight: '800', fontSize: 12 }}>
                {option.label}
                {busy ? ' · ya tiene' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={[styles.other, isOther ? { borderColor: colors.primary.main } : null]}>
          <NegocioDatePicker
            value={isOther ? value : ''}
            onChange={(next) => next && onChange(next)}
            colors={colors}
            label="Otra fecha"
            accessibilityLabel="Elegir otra fecha para la ruta"
            minDate={today}
          />
        </View>
      </View>
      {error ? <Text style={{ color: colors.warning.dark, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  title: { fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  other: { flex: 1, minWidth: 140, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
});
