import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
  colors: ThemeColors;
};

const MODE_OPTIONS: { id: NegocioDeliveryMode; label: string }[] = [
  { id: 'directo', label: 'Retiro directo' },
  { id: 'remision', label: 'Enviar en remisión' },
];

/**
 * Destino de la orden de entrega que se crea al activar un negocio con origen
 * en bodega central: pendiente para retiro directo, o anidada en una remisión
 * `pending` elegida aquí.
 */
export function NegocioDeliveryModeSection({
  mode,
  onModeChange,
  remissions,
  selectedRemission,
  onSelectRemission,
  colors,
}: Props) {
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
          <Text style={[styles.label, { color: colors.text.secondary }]}>Remisión pendiente *</Text>
          {remissions.length === 0 ? (
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              No hay remisiones pendientes.
            </Text>
          ) : (
            remissions.map((remission) => {
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
