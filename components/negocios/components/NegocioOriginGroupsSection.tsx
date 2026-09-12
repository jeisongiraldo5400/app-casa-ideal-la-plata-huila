import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { RemissionOriginGroup } from '@/components/negocios/infrastructure/services/negociosDeliveryOrdersService';

type ThemeColors = {
  text: { primary: string; secondary: string };
  primary: { main: string; contrastText: string };
  background: { default: string; paper: string };
  divider: string;
};

type Props = {
  groups: RemissionOriginGroup[];
  loading: boolean;
  selectedGroup: RemissionOriginGroup | null;
  onSelectGroup: (group: RemissionOriginGroup) => void;
  colors: ThemeColors;
};

/**
 * Con una remisión como origen del negocio, el vendedor elige UN grupo: el
 * saldo propio de la remisión o los productos de una sola OE de cliente
 * anidada. Una OE hija que ya tiene negocio se muestra pero no se puede elegir.
 */
export function NegocioOriginGroupsSection({
  groups,
  loading,
  selectedGroup,
  onSelectGroup,
  colors,
}: Props) {
  return (
    <View style={styles.block}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>
        Productos que toma el negocio *
      </Text>
      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
        El saldo propio de la remisión o los productos de una sola orden de cliente anidada.
      </Text>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary.main} />
          <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
            Cargando productos de la remisión…
          </Text>
        </View>
      ) : groups.length === 0 ? (
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
          La remisión no tiene productos disponibles para un negocio.
        </Text>
      ) : (
        groups.map((group) => {
          const selected = selectedGroup?.sourceOrderId === group.sourceOrderId;
          const disabled = group.hasNegocio;
          return (
            <Pressable
              key={`${group.kind}-${group.sourceOrderId}`}
              onPress={() => onSelectGroup(group)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              style={[
                styles.card,
                {
                  backgroundColor: selected ? colors.primary.main + '12' : colors.background.paper,
                  borderColor: selected ? colors.primary.main : colors.divider,
                  opacity: disabled ? 0.5 : 1,
                },
              ]}
            >
              <MaterialIcons
                name={selected ? 'check-circle' : group.kind === 'own' ? 'inventory' : 'person'}
                size={22}
                color={selected ? colors.primary.main : colors.text.secondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{group.label}</Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary }}>
                  {disabled
                    ? 'Ya tiene negocio asociado'
                    : `${group.items.length} producto(s) disponible(s)`}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
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
