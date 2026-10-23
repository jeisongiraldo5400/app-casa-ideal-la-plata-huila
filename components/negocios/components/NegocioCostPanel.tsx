import { useTheme } from '@/components/theme';
import { HelpHint, ListCard, Metric, SectionHeader } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { COST_HELP, profitPctOfCosted, profitView } from '@/lib/costos/costHelp';
import {
  costAlertLevel,
  costAlertText,
  type NegocioCostResult,
} from '@/lib/negocios/negocioCosts';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  result: NegocioCostResult;
  /** Con resumen (costo total y ganancia total). */
  showTotals?: boolean;
};

const money = (value: number | null) => (value === null ? '—' : formatCOP(value));

/**
 * Costo y ganancia por línea («Ganancia» o «Pérdida» con su %). Solo se usa en
 * la pantalla del aviso de costos (`CostosOnlyNegocioView`), para el perfil
 * «costos» con conexión: el detalle, la creación y la edición del negocio nunca
 * lo muestran. Quien no tiene el perfil nunca lo ve (y el servidor tampoco le
 * respondería).
 */
export function NegocioCostPanel({ result, showTotals }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (!result.lines.length) return null;

  const snapshot = result.lines.some((line) => !line.live);
  const hint = snapshot ? 'Costo fijado al activar' : 'Costo de hoy';
  const totalProfit = profitView(
    result.totals?.marginAmount ?? null,
    profitPctOfCosted(result.totals?.cost ?? null, result.totals?.marginAmount ?? null)
  );

  return (
    <View style={styles.root} testID="negocio-cost-panel">
      <SectionHeader title="Costos y ganancia" hint={hint} />
      <View style={styles.noteRow}>
        <Text style={[styles.note, styles.noteText, { color: colors.text.secondary }]}>
          {snapshot
            ? 'Solo lo ve el perfil Costos. La ganancia se calcula con el costo fijado al activar.'
            : 'Solo lo ve el perfil Costos. La ganancia se calcula con el costo promedio.'}
        </Text>
        {snapshot ? <HelpHint term="Costo fijado" text={COST_HELP.costo_fijado} /> : null}
      </View>
      {result.lines.map((line, index) => {
        const level = costAlertLevel(line);
        const alert = costAlertText(line, result.minMarginPct);
        const tone = level === 'bajo_costo' ? 'error' : level === 'bajo_margen' ? 'warning' : 'default';
        const name = line.productName || 'Producto';
        const profit = profitView(line.marginAmount, line.marginPct);
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
                  <Metric label="Último costo" value={money(line.lastUnitCost)} help={COST_HELP.ultimo_costo} />
                  <Metric label="Costo promedio" value={money(line.avgUnitCost)} align="right" help={COST_HELP.costo_promedio} />
                </View>
                <View style={styles.row}>
                  <Metric
                    label={profit.label ?? 'Ganancia'}
                    value={profit.value}
                    tone={profit.negative ? 'error' : tone}
                    help={COST_HELP.ganancia}
                  />
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
              label={`${totalProfit.label ?? 'Ganancia'} total`}
              value={totalProfit.value}
              tone={totalProfit.negative ? 'error' : 'default'}
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
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  noteText: { flexShrink: 1 },
  name: { ...Typography.bodySmallStrong, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  alert: { marginTop: Spacing.sm, borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  alertText: { ...Typography.bodySmallStrong },
  footer: { borderRadius: Radius.control, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.xs },
});
