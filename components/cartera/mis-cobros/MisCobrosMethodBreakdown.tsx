import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { methodTotalLabel, type MisCobrosSummary } from '@/lib/cartera/misCobros';
import { formatCOP } from '@/lib/creditCalculator';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Resumen de «Cobros» por método de pago: método → total (n) de los pagos
 * vigentes que cumplen los filtros, más los descuentos de pronto pago y lo
 * anulado. Nada si el servidor no manda el desglose (versión anterior) y no
 * hay nada que decir.
 */
export function MisCobrosMethodBreakdown({ summary }: { summary: MisCobrosSummary }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const methods = summary.by_method ?? [];
  const discount = summary.total_discount ?? 0;
  const voided = summary.total_voided ?? 0;
  if (!methods.length && discount <= 0 && voided <= 0) return null;

  return (
    <View style={[styles.box, { borderTopColor: colors.divider }]} testID="mis-cobros-por-metodo">
      {methods.length ? (
        <>
          <Text style={[styles.title, { color: colors.text.secondary }]}>Por método de pago</Text>
          {methods.map((method) => (
            <View key={method.payment_method_id ?? 'sin-metodo'} style={styles.row}>
              <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
                {methodTotalLabel(method)}
                <Text style={{ color: colors.text.secondary }}> ({method.count})</Text>
              </Text>
              <Text style={[styles.amount, { color: colors.text.primary }]}>{formatCOP(method.total)}</Text>
            </View>
          ))}
        </>
      ) : null}
      {discount > 0 ? (
        <Text style={[styles.note, { color: colors.text.secondary }]}>
          Descuentos por pronto pago: {formatCOP(discount)}
          {summary.pronto_pago_count ? ` (${summary.pronto_pago_count})` : ''} · no son dinero recibido
        </Text>
      ) : null}
      {voided > 0 ? (
        <Text style={[styles.note, { color: colors.text.secondary }]}>Anulado (no suma): {formatCOP(voided)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, gap: Spacing.xs },
  title: { ...Typography.metadata },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { ...Typography.bodySmall, flex: 1 },
  amount: { ...Typography.bodySmall, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { ...Typography.caption },
});
