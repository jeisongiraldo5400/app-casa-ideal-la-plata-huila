import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { ListCard, Metric, StatusChip } from '@/components/ui';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo, labelNegocioStatus, negocioStatusTone } from '@/lib/negocioLabels';

export function NegocioListCard({ item, onPress }: { item: any; onPress: () => void }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const saldo = Number(item.remaining_balance ?? 0);
  const customer = item.customer?.name || 'Cliente';
  const meta = [
    item.deal_date,
    item.installments_count != null
      ? Number(item.installments_count) > 0
        ? `${item.installments_count} cuotas`
        : 'Sin cuotas'
      : null,
    item.installments_count != null ? (item.delivery_order_id ? 'OE creada' : 'Sin OE') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListCard
      onPress={onPress}
      accessibilityLabel={`Negocio ${formatNegocioCodigo(item.numero)}, ${customer}, ${labelNegocioStatus(item.status)}, saldo ${formatCOP(saldo)}`}>
      <View style={styles.cardTop}>
        <Text style={[styles.numero, { color: colors.text.primary }]}>{formatNegocioCodigo(item.numero)}</Text>
        <StatusChip label={labelNegocioStatus(item.status)} tone={negocioStatusTone(item.status)} />
      </View>
      <Text style={[styles.customer, { color: colors.text.primary }]} numberOfLines={1}>{customer}</Text>
      <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>{meta}</Text>
      <View style={[styles.amounts, { borderTopColor: colors.divider }]}>
        <Metric label="Crédito" value={formatCOP(Number(item.total_credit))} />
        <Metric
          label={item.has_mora ? 'Saldo · en mora' : 'Saldo'}
          value={formatCOP(saldo)}
          tone={item.has_mora ? 'error' : saldo <= 0 ? 'success' : 'default'}
          align="right"
        />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  numero: { ...Typography.bodyStrong, fontWeight: '800' },
  customer: { ...Typography.bodySmall },
  meta: { ...Typography.caption },
  amounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
