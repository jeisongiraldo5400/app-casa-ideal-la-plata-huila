import { useTheme } from '@/components/theme';
import { ListCard, Metric, SectionHeader } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import {
  costAlertLevel,
  costAlertText,
  formatMarginPct,
  type NegocioCostResult,
} from '@/lib/negocios/negocioCosts';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  result: NegocioCostResult;
  /** Nombre de cada producto por id (la vista previa no lo trae del servidor). */
  productNames?: Record<string, string>;
  /** Con resumen (costo total y margen): en el detalle del negocio. */
  showTotals?: boolean;
};

const money = (value: number | null) => (value === null ? '—' : formatCOP(value));

/**
 * Costo y margen por línea. Solo se monta para el perfil «costos» con
 * conexión; quien no tiene el perfil nunca lo ve (y el servidor tampoco le
 * respondería).
 */
export function NegocioCostPanel({ result, productNames, showTotals }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (!result.lines.length) return null;

  const snapshot = result.lines.some((line) => !line.live);
  const hint = snapshot ? 'Costo fijado al activar' : 'Costo de hoy';

  return (
    <View style={styles.root} testID="negocio-cost-panel">
      <SectionHeader title="Costos y margen" hint={hint} />
      <Text style={[styles.note, { color: colors.text.secondary }]}>
        Solo lo ve el perfil Costos. El margen se calcula con el costo promedio.
      </Text>
      {result.lines.map((line, index) => {
        const level = costAlertLevel(line);
        const alert = costAlertText(line, result.minMarginPct);
        const tone = level === 'bajo_costo' ? 'error' : level === 'bajo_margen' ? 'warning' : 'default';
        const name = line.productName || productNames?.[line.productId] || 'Producto';
        return (
          <ListCard key={`${line.productId}-${index}`}>
            <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>
              {name} · ×{line.quantity}
            </Text>
            {line.unitCost === null ? (
              <Text style={[styles.note, { color: colors.text.secondary }]}>
                Sin costo registrado: ninguna compra costeada todavía.
              </Text>
            ) : (
              <>
                <View style={styles.row}>
                  <Metric label="Último costo" value={money(line.lastUnitCost)} />
                  <Metric label="Costo promedio" value={money(line.avgUnitCost)} align="right" />
                </View>
                <View style={styles.row}>
                  <Metric label="Margen" value={money(line.marginAmount)} tone={tone} />
                  <Metric label="Margen %" value={formatMarginPct(line.marginPct)} tone={tone} align="right" />
                </View>
              </>
            )}
            {alert ? (
              <View
                testID={`negocio-cost-alert-${level}`}
                style={[
                  styles.alert,
                  { backgroundColor: (level === 'bajo_costo' ? colors.error.main : colors.warning.main) + '1f' },
                ]}
              >
                <Text
                  style={[
                    styles.alertText,
                    { color: level === 'bajo_costo' ? colors.error.dark : colors.warning.dark },
                  ]}
                >
                  {alert}
                </Text>
              </View>
            ) : null}
          </ListCard>
        );
      })}

      {showTotals && result.totals ? (
        <View style={[styles.footer, { backgroundColor: colors.surface.muted }]}>
          <View style={styles.row}>
            <Metric label="Costo total" value={money(result.totals.cost)} />
            <Metric
              label="Margen total"
              value={money(result.totals.marginAmount)}
              tone={(result.totals.marginAmount ?? 0) < 0 ? 'error' : 'default'}
              align="right"
            />
          </View>
          {result.totals.linesWithoutCost > 0 ? (
            <Text style={[styles.note, { color: colors.text.secondary }]}>
              {result.totals.linesWithoutCost === 1
                ? '1 producto sin costo no entra en el total.'
                : `${result.totals.linesWithoutCost} productos sin costo no entran en el total.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.sm },
  note: { ...Typography.metadata, fontWeight: '400' },
  name: { ...Typography.bodySmallStrong, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  alert: { marginTop: Spacing.sm, borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  alertText: { ...Typography.bodySmallStrong },
  footer: { borderRadius: Radius.control, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.xs },
});
