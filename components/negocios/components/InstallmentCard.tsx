import { useTheme } from '@/components/theme';
import { ListCard, Metric, StatusChip } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { cuotaStatusTone, labelCuotaNombre, labelCuotaNumero, labelCuotaStatus } from '@/lib/negocioLabels';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type InstallmentRow = {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number | string;
  paid_amount: number | string;
  late_fee_amount?: number | string | null;
  status: string;
};

/** Tarjeta de una cuota: número, vencimiento, estado y valores. */
export function InstallmentCard({ cuota }: { cuota: InstallmentRow }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const tone = cuotaStatusTone(cuota.status);
  const accent = tone === 'neutral' ? colors.text.secondary : colors[tone].main;
  const late = Number(cuota.late_fee_amount || 0);
  const total = Number(cuota.amount) + late;
  const paid = Number(cuota.paid_amount);
  const saldo = Math.max(total - paid, 0);

  return (
    <ListCard>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: `${accent}18` }]}>
          <Text style={[styles.badgeText, { color: accent }]}>{labelCuotaNumero(cuota.installment_number)}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text.primary }]}>{labelCuotaNombre(cuota.installment_number)}</Text>
          <Text style={[styles.due, { color: colors.text.secondary }]}>Vence {cuota.due_date}</Text>
        </View>
        <StatusChip label={labelCuotaStatus(cuota.status)} tone={tone} />
      </View>
      <View style={[styles.amounts, { borderTopColor: colors.divider }]}>
        <View style={styles.amount}>
          <Metric label="Valor" value={formatCOP(total)} />
          {late > 0 ? <Text style={[styles.late, { color: colors.error.main }]}>Incluye mora {formatCOP(late)}</Text> : null}
        </View>
        <Metric label="Pagado" value={formatCOP(paid)} tone="success" align="center" style={styles.amount} />
        <Metric label="Saldo" value={formatCOP(saldo)} tone={saldo > 0 ? 'default' : 'success'} align="right" style={styles.amount} />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  badge: { width: 40, height: 40, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...Typography.bodySmallStrong, fontWeight: '800' },
  copy: { flex: 1, gap: 2 },
  title: { ...Typography.bodyStrong },
  due: { ...Typography.metadata, fontWeight: '400' },
  amounts: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md, marginTop: Spacing.xs, gap: Spacing.sm },
  amount: { flex: 1 },
  late: { ...Typography.metadata, fontSize: 11, marginTop: 2 },
});
