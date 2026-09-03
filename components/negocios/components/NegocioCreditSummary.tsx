import { StyleSheet, Text, View } from 'react-native';
import { formatCOP, type CreditCalcResult, type CreditSettingsInput } from '@/lib/creditCalculator';
import type { DownPaymentEntry } from '@/lib/negocios/negocioCreditRules';
import { buildNegocioCreditSummary } from '@/lib/negocios/negocioCreditSummary';
import type { getColors } from '@/constants/theme';

type Colors = ReturnType<typeof getColors>;

interface Props {
  calc: CreditCalcResult;
  settings: CreditSettingsInput;
  schedule: DownPaymentEntry[];
  frequency: string;
  firstDueDate?: string | null;
  colors: Colors;
}

function Row({
  label,
  value,
  bold,
  colors,
}: {
  label: string;
  value: string;
  bold?: boolean;
  colors: Colors;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text.primary, fontWeight: bold ? '700' : '400' }]}>
        {label}
      </Text>
      <Text style={{ color: colors.text.primary, fontWeight: bold ? '700' : '400', fontSize: 14 }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Desglose completo del crédito: productos, interés, cada abono pactado,
 * saldo a financiar, plan de cuotas y por qué la cuota da ese valor.
 */
export function NegocioCreditSummary({ calc, settings, schedule, frequency, firstDueDate, colors }: Props) {
  // formatCOP móvil siempre imprime COP sin decimales.
  const money = (value: number) => formatCOP(value);
  const summary = buildNegocioCreditSummary({ calc, settings, schedule, frequency, firstDueDate });
  const note = { color: colors.text.secondary, fontSize: 12 };

  return (
    <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 15 }}>Resumen del crédito</Text>
      <Row label="Valor productos" value={money(summary.productsSubtotal)} colors={colors} />
      <Row label="Interés" value={money(summary.interestAmount)} colors={colors} />
      <Text style={note}>{summary.interestNote}</Text>
      <Row label="Valor total crédito" value={money(summary.totalCredit)} bold colors={colors} />

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />
      {summary.downPayments.length === 0 ? (
        <Text style={note}>Sin abonos iniciales: todo el valor se financia en cuotas.</Text>
      ) : (
        <>
          <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 14 }}>
            Abonos iniciales pactados
          </Text>
          {summary.downPayments.map((abono) => (
            <Row
              key={`${abono.label}-${abono.dueDate}`}
              label={`${abono.label} · paga el ${abono.dueDate || '—'}`}
              value={money(abono.amount)}
              colors={colors}
            />
          ))}
          <Row label="Total abonos" value={money(summary.downPaymentTotal)} bold colors={colors} />
          <Text style={note}>Cada abono queda pendiente en cartera hasta que el cliente lo pague.</Text>
        </>
      )}

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />
      <Row label="Saldo a financiar" value={money(summary.financedAmount)} bold colors={colors} />
      {summary.plan ? (
        <>
          <Row
            label={`Plan: ${summary.plan.installmentsCount} cuotas ${summary.plan.frequencyLabel}`}
            value={money(summary.plan.installmentAmount)}
            bold
            colors={colors}
          />
          <Row label="Primera cuota" value={summary.plan.firstDueDate || '—'} colors={colors} />
          {summary.plan.regularCount !== summary.plan.installmentsCount && (
            <Row
              label={`Última cuota (${summary.plan.installmentsCount})`}
              value={money(summary.plan.lastInstallmentAmount)}
              colors={colors}
            />
          )}
          <Text style={note}>{summary.plan.calculation}</Text>
        </>
      ) : (
        <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 14 }}>
          Sin cuotas: pagado con abonos iniciales
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 12, gap: 6, marginTop: 8, borderWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  rowLabel: { flex: 1, fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
});
