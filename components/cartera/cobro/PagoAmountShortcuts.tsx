import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing, Typography, type ThemeColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import type { PagoAmountShortcut } from '@/lib/cartera/cobroFormDefaults';

type Props = {
  shortcuts: PagoAmountShortcut[];
  onPick: (amount: number) => void;
  disabled?: boolean;
  colors: ThemeColors;
};

/** Atajos bajo «Valor del pago»: llenan el campo con lo vencido o la cuota actual. */
export function PagoAmountShortcuts({ shortcuts, onPick, disabled, colors }: Props) {
  if (!shortcuts.length) return null;
  return (
    <View style={styles.row}>
      {shortcuts.map((shortcut) => (
        <Pressable
          key={shortcut.key}
          accessibilityRole="button"
          accessibilityLabel={`${shortcut.label}: ${formatCOP(shortcut.amount)}`}
          disabled={disabled}
          onPress={() => onPick(shortcut.amount)}
          style={[styles.chip, { borderColor: colors.primary.main, opacity: disabled ? 0.5 : 1 }]}>
          <Text style={[styles.label, { color: colors.primary.main }]}>{shortcut.label}</Text>
          <Text style={[styles.amount, { color: colors.text.primary }]}>{formatCOP(shortcut.amount)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: -Spacing.xs, marginBottom: Spacing.md },
  chip: { borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  label: { ...Typography.caption, fontWeight: '700' },
  amount: { ...Typography.caption },
});
