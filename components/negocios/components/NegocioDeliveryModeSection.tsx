import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchField } from '@/components/ui/SearchField';
import { filterPendingRemissions } from '@/components/negocios/domain/pendingRemissionSearch';
import {
  formatPendingRemissionLabel,
  type PendingRemissionOption,
} from '@/components/negocios/infrastructure/services/negociosDeliveryOrdersService';

/** Con origen bodega: el cliente retira / se entrega directo, o la OE viaja en una remisión pendiente. */
export type NegocioDeliveryMode = 'directo' | 'remision';

type ThemeColors = {
  text: { primary: string; secondary: string };
  primary: { main: string; contrastText: string };
  background: { default: string; paper: string };
  divider: string;
};

type Props = {
  mode: NegocioDeliveryMode;
  onModeChange: (mode: NegocioDeliveryMode) => void;
  remissions: PendingRemissionOption[];
  selectedRemission: PendingRemissionOption | null;
  onSelectRemission: (remission: PendingRemissionOption) => void;
  /** Sin señal: la lista es la que bajó con la última descarga. */
  offline?: boolean;
  /** «Actualizar remisiones»: vuelve a pedir la lista (con señal) o relee la del teléfono. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Aviso tras actualizar (p. ej. la remisión elegida ya no está pendiente). */
  refreshNotice?: string | null;
  colors: ThemeColors;
};

/** Sin señal y sin remisiones pendientes en el teléfono: qué hacer. */
export const SIN_REMISIONES_EN_EL_TELEFONO =
  'No hay remisiones pendientes en el teléfono. Con señal, pulse «Descargar información» antes de salir para traer las remisiones abiertas, o elija «Retiro directo».';

const MODE_OPTIONS: { id: NegocioDeliveryMode; label: string }[] = [
  { id: 'directo', label: 'Retiro directo' },
  { id: 'remision', label: 'Enviar en remisión' },
];

/**
 * Destino de la orden de entrega que se crea al activar un negocio con origen
 * al sacar de bodegas: pendiente para retiro directo, o anidada en una remisión
 * `pending` elegida aquí.
 */
export function NegocioDeliveryModeSection({
  mode,
  onModeChange,
  remissions,
  selectedRemission,
  onSelectRemission,
  offline = false,
  onRefresh,
  refreshing = false,
  refreshNotice = null,
  colors,
}: Props) {
  const [query, setQuery] = useState('');
  const filtered = filterPendingRemissions(remissions, query);
  // La elegida no desaparece aunque el buscador no la encuentre.
  const visible =
    selectedRemission && !filtered.some((remission) => remission.id === selectedRemission.id)
      ? [selectedRemission, ...filtered]
      : filtered;
  return (
    <View style={styles.block}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>Entrega</Text>
      <View style={styles.rowWrap}>
        {MODE_OPTIONS.map((option) => {
          const active = mode === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => onModeChange(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary.main : colors.background.paper,
                  borderColor: colors.divider,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? colors.primary.contrastText : colors.text.primary,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
        {mode === 'remision'
          ? 'Al activar, la orden de entrega del negocio se anida en la remisión elegida.'
          : 'La orden de entrega queda pendiente para retiro o entrega directa.'}
      </Text>

      {mode === 'remision' && (
        <View style={{ gap: 6 }}>
          <View style={styles.headerRow}>
            <Text style={[styles.label, { color: colors.text.secondary }]}>Remisión pendiente *</Text>
            {onRefresh ? (
              <Pressable
                onPress={onRefresh}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel="Actualizar remisiones"
                testID="actualizar-remisiones"
                hitSlop={8}
                style={[styles.refresh, { borderColor: colors.divider, opacity: refreshing ? 0.6 : 1 }]}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={colors.primary.main} />
                ) : (
                  <MaterialIcons name="refresh" size={18} color={colors.primary.main} />
                )}
                <Text style={{ color: colors.primary.main, fontWeight: '700', fontSize: 12 }}>
                  {refreshing ? 'Actualizando…' : 'Actualizar remisiones'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {refreshNotice ? (
            <Text style={{ color: colors.text.secondary, fontSize: 12 }} testID="aviso-remisiones">
              {refreshNotice}
            </Text>
          ) : null}
          {remissions.length > 0 ? (
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar remisión por número, responsable o zona"
              autoCorrect={false}
              testID="buscar-remision"
            />
          ) : null}
          {remissions.length > 0 && query.trim() ? (
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              {filtered.length} de {remissions.length} remisiones
            </Text>
          ) : null}
          {offline && remissions.length > 0 ? (
            <Text style={{ color: colors.text.secondary, fontSize: 12 }} testID="remisiones-desde-telefono">
              Remisiones pendientes de la última descarga. El servidor confirma que siga abierta al
              enviar el negocio.
            </Text>
          ) : null}
          {remissions.length === 0 ? (
            <Text
              style={{ color: colors.text.secondary, fontSize: 12 }}
              testID={offline ? 'sin-remisiones-en-telefono' : undefined}
            >
              {offline ? SIN_REMISIONES_EN_EL_TELEFONO : 'No hay remisiones pendientes.'}
            </Text>
          ) : visible.length === 0 ? (
            <Text style={{ color: colors.text.secondary, fontSize: 12 }} testID="remisiones-sin-coincidencias">
              Ninguna remisión coincide con «{query.trim()}».
            </Text>
          ) : (
            visible.map((remission) => {
              const selected = selectedRemission?.id === remission.id;
              return (
                <Pressable
                  key={remission.id}
                  onPress={() => onSelectRemission(remission)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.card,
                    {
                      backgroundColor: selected ? colors.primary.main + '12' : colors.background.paper,
                      borderColor: selected ? colors.primary.main : colors.divider,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={selected ? 'check-circle' : 'local-shipping'}
                    size={22}
                    color={selected ? colors.primary.main : colors.text.secondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                      {formatPendingRemissionLabel(remission)}
                    </Text>
                    {remission.notes ? (
                      <Text style={{ fontSize: 12, color: colors.text.secondary }} numberOfLines={2}>
                        {remission.notes}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  refresh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginTop: 2 },
});
