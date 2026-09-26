import { StyleSheet, Text } from 'react-native';
import { Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioLocationLine, type NegocioListRow } from '@/lib/negocios/negociosListQuery';

type CobroFields = Partial<
  Pick<
    NegocioListRow,
    'address' | 'vereda_name' | 'municipio_name' | 'has_mora' | 'dias_atraso' | 'overdue_amount' | 'next_due_date' | 'next_due_amount'
  >
>;

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function formatDay(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : value;
}

/** Texto de cobro: días de atraso o la próxima cuota. Null si no hay dato. */
export function describeNegocioCobro(item: CobroFields): { text: string; overdue: boolean } | null {
  if (item.has_mora && item.dias_atraso != null) {
    const days = Number(item.dias_atraso);
    const amount = Number(item.overdue_amount ?? 0);
    return {
      text: `${days} ${days === 1 ? 'día' : 'días'} de atraso${amount > 0 ? ` · vencido ${formatCOP(amount)}` : ''}`,
      overdue: true,
    };
  }
  if (item.next_due_date) {
    const amount = item.next_due_amount != null ? ` · ${formatCOP(Number(item.next_due_amount))}` : '';
    return { text: `Próxima cuota ${formatDay(item.next_due_date)}${amount}`, overdue: false };
  }
  return null;
}

/**
 * Ubicación y situación de cobro en la tarjeta del negocio. Sólo se pintan
 * si la fila trae el dato (la lista unificada lo trae con y sin señal).
 */
export function NegocioCobroLines({ item, colors }: { item: CobroFields; colors: ReturnType<typeof getColors> }) {
  const location = formatNegocioLocationLine({
    address: item.address ?? null,
    vereda_name: item.vereda_name ?? null,
    municipio_name: item.municipio_name ?? null,
  });
  const cobro = describeNegocioCobro(item);
  return (
    <>
      {location ? (
        <Text style={[styles.line, { color: colors.text.secondary }]} numberOfLines={1}>
          {location}
        </Text>
      ) : null}
      {cobro ? (
        <Text
          style={[styles.line, cobro.overdue ? styles.strong : null, { color: cobro.overdue ? colors.error.main : colors.text.secondary }]}
          numberOfLines={1}>
          {cobro.text}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  line: { ...Typography.caption },
  strong: { fontWeight: '700' },
});
