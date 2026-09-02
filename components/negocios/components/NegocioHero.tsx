import { useTheme } from '@/components/theme';
import { Metric } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { labelNegocioStatus } from '@/lib/negocioLabels';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  customerName: string;
  address: string;
  status: string;
  totalCredit: number;
  totalPaid: number;
  pendingBalance: number;
  /** "12 cuotas de $100.000 · OE 45" */
  planLabel?: string | null;
};

/** Cabecera de marca del detalle: cliente, estado y las tres cifras del crédito. */
export function NegocioHero({ customerName, address, status, totalCredit, totalPaid, pendingBalance, planLabel }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  // En oscuro `primary.main` es #3b82f6 y el texto blanco no alcanza AA: se usa
  // siempre el azul profundo, que en ambos temas está disponible como token.
  const background = isDark ? colors.primary.dark : colors.primary.main;

  return (
    <View
      accessible
      accessibilityLabel={`${customerName}. ${labelNegocioStatus(status)}. Crédito ${formatCOP(totalCredit)}, pagado ${formatCOP(totalPaid)}, saldo ${formatCOP(pendingBalance)}`}
      style={[styles.hero, { backgroundColor: background }]}>
      <View style={styles.top}>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.onPrimary.textMuted }]}>Cliente</Text>
          <Text style={[styles.customer, { color: colors.onPrimary.text }]} numberOfLines={2}>{customerName}</Text>
          <Text style={[styles.address, { color: colors.onPrimary.textMuted }]} numberOfLines={2}>{address}</Text>
        </View>
        <View style={[styles.status, { backgroundColor: colors.onPrimary.chipBg }]}>
          <Text style={[styles.statusText, { color: colors.onPrimary.text }]}>{labelNegocioStatus(status)}</Text>
        </View>
      </View>
      <View style={[styles.metrics, { borderTopColor: colors.onPrimary.border }]}>
        <Metric inverse label="Crédito" value={formatCOP(totalCredit)} style={styles.metric} />
        <Metric inverse label="Pagado" value={formatCOP(totalPaid)} style={styles.metric} align="center" />
        <Metric inverse label="Saldo" value={formatCOP(pendingBalance)} style={styles.metric} align="right" />
      </View>
      {planLabel ? <Text style={[styles.plan, { color: colors.onPrimary.textMuted }]}>{planLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: Radius.card, padding: Spacing.xl, gap: Spacing.lg },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  copy: { flex: 1, gap: 2 },
  eyebrow: { ...Typography.label },
  customer: { ...Typography.headline },
  address: { ...Typography.caption },
  status: { borderRadius: Radius.chip, paddingHorizontal: Spacing.sm, paddingVertical: 5 },
  statusText: { ...Typography.label },
  metrics: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md, gap: Spacing.sm },
  metric: { flex: 1 },
  plan: { ...Typography.metadata },
});
