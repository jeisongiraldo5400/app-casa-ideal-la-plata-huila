import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { IconButton, ListCard, StatusChip } from '@/components/ui';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { formatPaymentDateTime } from '@/lib/localDate';
import type { RejectedPagoRow } from '@/lib/offline/repositories/offlineRepository';

type Props = {
  pago: RejectedPagoRow;
  /** Acción explícita de la persona: sin esto el pago nunca se borra del teléfono. */
  onDelete: () => void;
  deleting?: boolean;
};

/**
 * Pago que el servidor no aceptó. Se muestra aparte de los pagos vigentes
 * (no suma al saldo) para que quede constancia del recibo que ya se entregó.
 */
export function RejectedPagoCard({ pago, onDelete, deleting }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const amount = formatCOP(Number(pago.amount));

  return (
    <ListCard
      accessibilityLabel={`Pago rechazado de ${amount}, ${formatPaymentDateTime(pago.paidAt)}`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${colors.error.main}18` }]}>
          <MaterialIcons name="report-problem" size={IconSize.md} color={colors.error.main} />
        </View>
        <View style={styles.copy}>
          <View style={styles.amountRow}>
            <Text style={[styles.amount, { color: colors.text.primary }]}>{amount}</Text>
            <StatusChip label="No aceptado" tone="error" />
          </View>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            {formatPaymentDateTime(pago.paidAt)}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Recibo físico: {pago.receiptNumber || 'No registrado'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Método: {pago.paymentMethodName || 'No registrado'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Registrado por: {pago.createdByName || 'Sin registro'}
          </Text>
          <Text style={[styles.meta, styles.reason, { color: colors.error.main }]}>
            Motivo: {pago.rejectedReason || 'El servidor no aceptó el pago'}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Este pago no cuenta en el saldo. Si el cliente ya tiene el recibo impreso, avise a la
            oficina antes de eliminarlo.
          </Text>
        </View>
      </View>
      <View style={[styles.actions, { borderTopColor: colors.divider }]}>
        <IconButton
          icon="delete-outline"
          label="Eliminar"
          accessibilityLabel={`Eliminar del teléfono el pago rechazado de ${amount}`}
          color={colors.error.main}
          backgroundColor={`${colors.error.main}12`}
          disabled={deleting}
          onPress={onDelete}
          style={styles.action}
        />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  icon: { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  amount: { ...Typography.bodyStrong, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  meta: { ...Typography.metadata, fontWeight: '400' },
  reason: { fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, marginTop: Spacing.xs },
  action: { borderWidth: 0, minWidth: 64 },
});
