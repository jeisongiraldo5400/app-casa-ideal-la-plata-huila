import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchField } from '@/components/ui';
import {
  DELIVERY_ORDER_SEARCH_LIMIT,
  formatDeliveryOrderOptionLabel,
  type DeliveryOrderOption,
} from '@/components/negocios/infrastructure/services/negociosDeliveryOrdersService';

type ThemeColors = {
  text: { primary: string; secondary: string };
  primary: { main: string };
  background: { paper: string };
  divider: string;
  error: { main: string };
};

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  orders: DeliveryOrderOption[];
  loading: boolean;
  error: string | null;
  selectedOrder: DeliveryOrderOption | null;
  onSelect: (order: DeliveryOrderOption) => void;
  onClearSelection: () => void;
  colors: ThemeColors;
};

/**
 * Elegir la orden de entrega de la que sale un negocio.
 *
 * Vive fuera de la pantalla a propósito: un campo de texto declarado dentro de
 * otro componente se remonta en cada tecla (le pasó al buscador de «Mis
 * órdenes»).
 *
 * Con una orden elegida, la lista se pliega a esa sola tarjeta. Antes seguía
 * abierta y lo que faltaba por completar —productos de la remisión, cliente,
 * ubicación— quedaba cientos de tarjetas más abajo.
 */
export function NegocioOriginOrderPicker({
  query,
  onQueryChange,
  orders,
  loading,
  error,
  selectedOrder,
  onSelect,
  onClearSelection,
  colors,
}: Props) {
  if (selectedOrder) {
    return (
      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Orden de entrega *</Text>
        <View
          testID="origin-order-selected"
          style={[styles.card, { backgroundColor: colors.primary.main + '12', borderColor: colors.primary.main }]}
        >
          <MaterialIcons name="check-circle" size={22} color={colors.primary.main} />
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
              {formatDeliveryOrderOptionLabel(selectedOrder)}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.text.secondary }]}>
              {selectedOrder.items.length} producto(s) disponible(s)
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cambiar orden de entrega"
            onPress={onClearSelection}
            hitSlop={8}
            style={[styles.changeBtn, { borderColor: colors.divider }]}
          >
            <Text style={{ color: colors.primary.main, fontWeight: '700', fontSize: 12 }}>Cambiar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>Orden de entrega *</Text>
      <SearchField
        value={query}
        onChangeText={onQueryChange}
        placeholder="Buscar por número, cliente, documento o asesor"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary.main} />
        </View>
      ) : error ? (
        <Text style={[styles.hint, { color: colors.error.main }]}>{error}</Text>
      ) : orders.length === 0 ? (
        <Text style={[styles.hint, { color: colors.text.secondary }]}>
          {query.trim()
            ? 'Ninguna orden con productos disponibles coincide con la búsqueda.'
            : 'No hay órdenes con productos disponibles.'}
        </Text>
      ) : (
        <>
          {!query.trim() && (
            <Text style={[styles.hint, { color: colors.text.secondary }]}>
              Las {DELIVERY_ORDER_SEARCH_LIMIT} más recientes. Escribe para buscar cualquier otra.
            </Text>
          )}
          {orders.map((order) => (
            <Pressable
              key={order.id}
              testID={`origin-order-${order.id}`}
              accessibilityRole="button"
              onPress={() => onSelect(order)}
              style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            >
              <MaterialIcons name="local-shipping" size={22} color={colors.text.secondary} />
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                  {formatDeliveryOrderOptionLabel(order)}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.text.secondary }]}>
                  {order.items.length} producto(s) disponible(s)
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12 },
  state: { paddingVertical: 16, alignItems: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  cardMeta: { fontSize: 12 },
  changeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
});
