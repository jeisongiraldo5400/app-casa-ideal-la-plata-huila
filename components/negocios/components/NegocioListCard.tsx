import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { ListCard, Metric, StatusChip } from '@/components/ui';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo, labelNegocioStatus, negocioStatusTone } from '@/lib/negocioLabels';
import { describeNegocioOrigen } from '@/lib/negocios/negocioOrigen';
import { NEGOCIO_SYNC_BADGE, type NegocioSyncState } from '@/lib/negocios/negocioSyncBadge';
import { NegocioCobroLines } from './NegocioCobroLines';

export function NegocioListCard({
  item,
  onPress,
  syncState,
}: {
  item: any;
  onPress: () => void;
  /** Negocio creado en el teléfono y aún sin confirmar (ver `useNegocioSyncOverlay`). */
  syncState?: NegocioSyncState | null;
}) {
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
  ]
    .filter(Boolean)
    .join(' · ');
  // Qué orden tiene el negocio y de dónde salió la mercancía. Va en su propia
  // línea para que el número quepa completo en un teléfono. Sin conexión la
  // fila local no trae el dato y `describeNegocioOrigen` devuelve null: la
  // línea simplemente no se pinta.
  const origen = describeNegocioOrigen(item);
  const syncBadge = syncState ? NEGOCIO_SYNC_BADGE[syncState] : null;
  // El número lo asigna el servidor: sin confirmar, la fila local lleva 0.
  const codigo = syncBadge && !Number(item.numero) ? 'Sin número' : formatNegocioCodigo(item.numero);

  return (
    <ListCard
      onPress={onPress}
      accessibilityLabel={`Negocio ${codigo}, ${customer}, ${labelNegocioStatus(item.status)}${syncBadge ? `, ${syncBadge.label}` : ''}, saldo ${formatCOP(saldo)}${origen ? `, ${origen.texto}` : ''}`}
      accessibilityHint={syncBadge?.hint}>
      <View style={styles.cardTop}>
        <Text style={[styles.numero, { color: colors.text.primary }]}>{codigo}</Text>
        <StatusChip label={labelNegocioStatus(item.status)} tone={negocioStatusTone(item.status)} />
      </View>
      {syncBadge ? <StatusChip label={syncBadge.label} tone={syncBadge.tone} icon={syncBadge.icon} /> : null}
      <Text style={[styles.customer, { color: colors.text.primary }]} numberOfLines={1}>
        {item.customer?.id_number ? `${customer} · CC ${item.customer.id_number}` : customer}
      </Text>
      <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>{meta}</Text>
      {origen ? (
        <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
          {origen.texto}
        </Text>
      ) : null}
      <NegocioCobroLines item={item} colors={colors} />
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
