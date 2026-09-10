import { useTheme } from '@/components/theme';
import { Card, Metric, SectionHeader } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CustomerSummaryCartera, CustomerSummaryScope } from '@/lib/customers/customerSummary';

interface CustomerCarteraSummaryProps {
  cartera: CustomerSummaryCartera;
  scope: CustomerSummaryScope;
  /** Sin conexión no se calcula el resumen: se oculta en vez de mostrar ceros. */
  unavailable?: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin cuotas pendientes';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CustomerCarteraSummary({ cartera, scope, unavailable }: CustomerCarteraSummaryProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <View>
      <SectionHeader title="Cartera" />
      <Card>
        {unavailable ? (
          <Text style={[styles.note, { color: colors.text.secondary }]}>
            El resumen de cartera necesita conexión. Los negocios se muestran con los datos locales.
          </Text>
        ) : (
          <>
            <View style={styles.grid}>
              <Metric label="Deuda total" value={formatCOP(cartera.total_balance)} style={styles.cell} />
              <Metric
                label="Saldo vencido"
                value={formatCOP(cartera.overdue_balance)}
                tone={cartera.overdue_balance > 0 ? 'error' : 'default'}
                style={styles.cell}
              />
              <Metric
                label="Cuotas vencidas"
                value={cartera.overdue_installments}
                tone={cartera.overdue_installments > 0 ? 'warning' : 'default'}
                style={styles.cell}
              />
              <Metric label="Próximo vence" value={formatDate(cartera.next_due_date)} style={styles.cell} />
            </View>
            {cartera.next_due_date ? (
              <Text style={[styles.note, { color: colors.text.secondary }]}>
                Próxima cuota: {formatCOP(cartera.next_due_amount)}
              </Text>
            ) : null}
            <Text style={[styles.note, { color: colors.text.secondary }]}>
              {cartera.last_payment
                ? `Último pago: ${formatCOP(cartera.last_payment.amount)} · ${formatDate(cartera.last_payment.paid_at)}`
                : 'Sin pagos registrados'}
            </Text>
          </>
        )}
        {scope.hidden_negocios > 0 ? (
          <Text style={[styles.note, { color: colors.warning.main }]}>
            Este cliente tiene {scope.hidden_negocios} negocio
            {scope.hidden_negocios === 1 ? '' : 's'} de otro vendedor. Las cifras son solo de lo que tú gestionas.
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.md },
  cell: { width: '50%' },
  note: { ...Typography.metadata, marginTop: Spacing.sm },
});
