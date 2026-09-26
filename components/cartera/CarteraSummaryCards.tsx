import { StyleSheet, Text, View } from 'react-native';
import { Radius, Shadows, Spacing, type ThemeColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import type { CarteraDashboard } from '@/lib/cartera/carteraService';

type Props = {
  summary: CarteraDashboard['summary'] | undefined;
  colors: ThemeColors;
};

/** Tarjetas del resumen de Cartera: pendiente, vencida, recaudado del mes y cumplimiento. */
export function CarteraSummaryCards({ summary = {}, colors }: Props) {
  const compliance = Number(summary.collection_compliance || 0);
  const cards: { label: string; value: string; color: string }[] = [
    { label: 'Cartera pendiente', value: formatCOP(Number(summary.total_balance || 0)), color: colors.primary.main },
    { label: 'Cartera vencida', value: formatCOP(Number(summary.overdue_balance || 0)), color: colors.error.main },
    { label: 'Recaudado mes', value: formatCOP(Number(summary.collected_month || 0)), color: colors.success.main },
    {
      label: 'Cumplimiento',
      value: `${compliance.toFixed(1)}%`,
      color: compliance >= 90 ? colors.success.main : colors.warning.main,
    },
  ];
  return (
    <View style={styles.cards}>
      {cards.map((card) => (
        <View key={card.label} style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>{card.label}</Text>
          <Text style={[styles.value, { color: card.color }]} numberOfLines={1}>
            {card.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.md },
  card: { width: '48%', minHeight: 82, borderWidth: 1, borderRadius: Radius.card, padding: Spacing.md, gap: 4, ...Shadows.card },
  label: { fontSize: 11 },
  value: { fontWeight: '800', fontSize: 15 },
});
