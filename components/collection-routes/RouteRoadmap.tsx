import { useTheme } from '@/components/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CollectionRouteStop, StopStatus } from '@/lib/collection-routes/types';
import { formatNegocioCodigo } from '@/lib/negocioLabels';

const STATUS_META: Record<StopStatus, { color: string; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  pendiente: { color: '#94a3b8', label: 'Pendiente', icon: 'schedule' },
  actual: { color: '#2563eb', label: 'Parada actual', icon: 'near-me' },
  cobrado: { color: '#16a34a', label: 'Cobrado', icon: 'check-circle' },
  sin_pago: { color: '#f59e0b', label: 'Sin pago', icon: 'money-off' },
  reprogramado: { color: '#7c3aed', label: 'Reprogramado', icon: 'event-repeat' },
  omitido: { color: '#dc2626', label: 'Omitido', icon: 'skip-next' },
  no_visitada: { color: '#64748b', label: 'No visitada', icon: 'do-not-disturb-on' },
};

/** Etiqueta, color e ícono del estado (con respaldo si el servidor trae uno nuevo). */
export function stopStatusMeta(status: StopStatus) {
  return STATUS_META[status] || { color: '#94a3b8', label: String(status), icon: 'help-outline' as const };
}


/** Qué pasó en la visita: lo cobrado o el motivo de la novedad. */
export function stopOutcomeText(stop: CollectionRouteStop): string | null {
  if (stop.status === 'cobrado') {
    return stop.payment_amount != null ? `Cobró ${formatCOP(stop.payment_amount)}` : 'Cobro registrado';
  }
  if (stop.outcome_reason) return stop.outcome_reason;
  return null;
}

export function RouteRoadmap({
  stops,
  onPressStop,
}: {
  stops: CollectionRouteStop[];
  onPressStop: (stop: CollectionRouteStop) => void;
}) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={styles.container}>
      <View style={styles.startFinishRow}>
        <View style={[styles.terminal, { backgroundColor: '#0f172a' }]}>
          <MaterialIcons name="flag" color="#fff" size={16} />
        </View>
        <Text style={[styles.terminalText, { color: colors.text.secondary }]}>Inicio de la jornada</Text>
      </View>

      {stops.map((stop, index) => {
        const meta = stopStatusMeta(stop.status);
        const left = index % 2 === 0;
        const outcome = stopOutcomeText(stop);
        return (
          <View key={stop.id} style={styles.stopRow}>
            <View style={[styles.path, { backgroundColor: colors.divider }, left ? styles.pathLeft : styles.pathRight]} />
            <View style={[styles.node, { backgroundColor: meta.color, borderColor: colors.background.default }, left ? styles.nodeLeft : styles.nodeRight]}>
              {stop.status === 'cobrado' ? (
                <MaterialIcons name="check" color="#fff" size={18} />
              ) : (
                <Text style={styles.nodeText}>{stop.position}</Text>
              )}
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onPressStop(stop)}
              accessibilityRole="button"
              accessibilityLabel={`Parada ${stop.position}: ${stop.customer_name}, ${meta.label}`}
              style={[styles.card, left ? styles.cardRight : styles.cardLeft, { borderLeftColor: meta.color, backgroundColor: colors.background.paper }]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.business, { color: colors.text.primary }]}>
                  Negocio {formatNegocioCodigo(stop.negocio_numero)}
                </Text>
                <View style={[styles.badge, { backgroundColor: `${meta.color}18` }]}>
                  <MaterialIcons name={meta.icon} size={14} color={meta.color} />
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              <Text style={[styles.customer, { color: colors.text.primary }]} numberOfLines={1}>{stop.customer_name}</Text>
              <Text style={[styles.address, { color: colors.text.secondary }]} numberOfLines={2}>
                {[stop.customer_address, stop.municipality_name].filter(Boolean).join(', ')}
              </Text>
              {outcome ? (
                <Text style={[styles.outcome, { color: meta.color }]} numberOfLines={2}>{outcome}</Text>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={[styles.balance, { color: colors.text.primary }]}>{formatCOP(stop.expected_balance)}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.text.secondary} />
              </View>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.startFinishRow}>
        <View style={[styles.terminal, { backgroundColor: '#16a34a' }]}>
          <MaterialIcons name="sports-score" color="#fff" size={17} />
        </View>
        <Text style={[styles.terminalText, { color: colors.text.secondary }]}>Fin de la ruta</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 10 },
  startFinishRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, marginVertical: 8 },
  terminal: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  terminalText: { fontWeight: '800', color: '#475569', fontSize: 13 },
  stopRow: { minHeight: 150, position: 'relative', justifyContent: 'center' },
  path: { position: 'absolute', top: -8, bottom: -8, width: 3, backgroundColor: '#cbd5e1' },
  pathLeft: { left: '27%' },
  pathRight: { right: '27%' },
  node: { position: 'absolute', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', zIndex: 2, borderWidth: 3, borderColor: '#fff' },
  nodeLeft: { left: '27%', marginLeft: -16 },
  nodeRight: { right: '27%', marginRight: -16 },
  nodeText: { color: '#fff', fontWeight: '900' },
  card: { width: '66%', backgroundColor: '#fff', borderRadius: 16, padding: 13, borderLeftWidth: 4, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardRight: { alignSelf: 'flex-end' },
  cardLeft: { alignSelf: 'flex-start' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  business: { fontWeight: '900', color: '#0f172a', fontSize: 13 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, gap: 3 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  customer: { color: '#334155', fontWeight: '700', marginTop: 7 },
  address: { color: '#64748b', fontSize: 12, marginTop: 3, lineHeight: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  balance: { color: '#0f172a', fontWeight: '900' },
  outcome: { fontSize: 12, fontWeight: '700', marginTop: 5 },
});

