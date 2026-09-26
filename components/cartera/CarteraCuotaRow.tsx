import { memo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Radius, Shadows, Spacing, type ThemeColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo, labelCuotaNombre } from '@/lib/negocioLabels';
import type { CarteraRow } from '@/lib/cartera/carteraService';
import { mapsHref, telHref } from '@/lib/cartera/carteraContact';
import { labelUltimaGestion, type UltimaGestion } from '@/lib/collection-routes/ultimaGestion';
import { CarteraCuotaPeople } from './CarteraCuotaPeople';

const STATUS_LABEL: Record<string, string> = { mora: 'En mora', parcial: 'Parcial', pagada: 'Pagada', pendiente: 'Pendiente' };

/** Días de atraso a la fecha local (0 si aún no vence). */
export function daysOverdue(date: string, today: Date = new Date()): number {
  const due = new Date(`${date}T12:00:00`);
  const noon = new Date(today);
  noon.setHours(12, 0, 0, 0);
  return Math.max(0, Math.floor((noon.getTime() - due.getTime()) / 86400000));
}

type Props = {
  row: CarteraRow;
  colors: ThemeColors;
  onPress: (negocioId: string) => void;
  /** Última novedad de ruta del negocio («Sin pago» / «Reprogramado»). */
  gestion?: UltimaGestion | null;
};

/**
 * Una cuota del listado de Cartera: negocio · cuota, cliente · CC · municipio,
 * vencimiento y atraso, personas del negocio, saldo («de $valor» si hubo
 * abonos) y estado. Una cuota pagada muestra su valor completo y «Pagada».
 */
export const CarteraCuotaRow = memo(function CarteraCuotaRow({ row, colors, onPress, gestion }: Props) {
  const tel = telHref(row.customer_phone);
  const map = mapsHref({ address: row.customer_address, municipio: row.municipio_name, departamento: row.departamento_name });
  const paid = row.status === 'pagada';
  const overdue = paid ? 0 : daysOverdue(row.due_date);
  const border =
    row.status === 'mora' || overdue > 30 ? colors.error.main : overdue > 0 ? colors.warning.main : colors.primary.main;
  const statusColor =
    row.status === 'mora' ? colors.error.main : paid ? colors.success.main : colors.text.secondary;

  return (
    <Pressable
      onPress={() => onPress(row.negocio_id)}
      style={[styles.row, { backgroundColor: colors.background.paper, borderLeftColor: border }]}>
      <View style={styles.main}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {formatNegocioCodigo(row.negocio_numero)} · {labelCuotaNombre(row.installment_number)}
        </Text>
        <Text style={[styles.customer, { color: colors.text.secondary }]}>
          {row.customer_name || 'Cliente'}
          {row.customer_id_number ? ` · CC ${row.customer_id_number}` : ''}
          {row.municipio_name ? ` · ${row.municipio_name}` : ''}
        </Text>
        <Text style={[styles.due, { color: overdue > 0 ? colors.error.main : colors.text.secondary }]}>
          Vence {row.due_date}
          {overdue > 0 ? ` · ${overdue} días de atraso` : ''}
        </Text>
        <CarteraCuotaPeople row={row} colors={colors} />
        {gestion ? (
          <Text style={[styles.gestion, { color: colors.warning.dark }]} numberOfLines={2} testID="cartera-ultima-gestion">
            Última gestión: {labelUltimaGestion(gestion)}
          </Text>
        ) : null}
        {tel || map ? (
          <View style={styles.actions}>
            {tel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Llamar a ${row.customer_name || 'el cliente'}`}
                hitSlop={6}
                onPress={() => void Linking.openURL(tel).catch(() => undefined)}
                style={[styles.action, { borderColor: colors.divider }]}>
                <MaterialIcons name="call" size={16} color={colors.primary.main} />
                <Text style={[styles.actionText, { color: colors.primary.main }]}>Llamar</Text>
              </Pressable>
            ) : null}
            {map ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver la dirección en el mapa"
                hitSlop={6}
                onPress={() => void Linking.openURL(map).catch(() => undefined)}
                style={[styles.action, { borderColor: colors.divider }]}>
                <MaterialIcons name="map" size={16} color={colors.primary.main} />
                <Text style={[styles.actionText, { color: colors.primary.main }]}>Mapa</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.side}>
        <Text style={[styles.amount, { color: colors.text.primary }]}>
          {formatCOP(Number(paid ? row.amount : row.saldo))}
        </Text>
        {!paid && Number(row.amount) !== Number(row.saldo) ? (
          <Text style={[styles.of, { color: colors.text.secondary }]}>de {formatCOP(Number(row.amount))}</Text>
        ) : null}
        <Text style={[styles.status, { color: statusColor }]}>{STATUS_LABEL[row.status] || 'Pendiente'}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: Radius.card,
    borderLeftWidth: 4,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: '800' },
  customer: { fontSize: 13 },
  due: { fontSize: 12 },
  side: { alignItems: 'flex-end', gap: 4 },
  amount: { fontWeight: '800' },
  of: { fontSize: 11 },
  status: { fontSize: 12, fontWeight: '700' },
  gestion: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
});
