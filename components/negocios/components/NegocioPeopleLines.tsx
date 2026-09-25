import { StyleSheet, Text, View } from 'react-native';

type ThemeColors = {
  text: { primary: string; secondary: string };
};

type Props = {
  /** Solo se muestra si se pasa (en la confirmación final). */
  sellerName?: string | null;
  createdByName: string | null;
  /** `null` = no hay cliente elegido y la línea se oculta. */
  customerSellerText: string | null;
  colors: ThemeColors;
};

/**
 * Al crear un negocio intervienen tres personas que se leían todas como
 * «vendedor»:
 * - Vendedor del negocio (`negocios.seller_id`): quien hizo la venta; se elige.
 * - Creado por (`negocios.created_by`): quien lo registra; se pone solo.
 * - Vendedor del cliente (`customers.seller_id`): el dueño del cliente.
 * Estas líneas son de solo lectura.
 */
export function NegocioPeopleLines({ sellerName, createdByName, customerSellerText, colors }: Props) {
  const line = (label: string, value: string, testID: string) => (
    <Text testID={testID} style={[styles.line, { color: colors.text.secondary }]}>
      {label}: <Text style={[styles.value, { color: colors.text.primary }]}>{value}</Text>
    </Text>
  );
  return (
    <View testID="negocio-people-lines" style={styles.wrap}>
      {sellerName !== undefined
        ? line('Vendedor del negocio', sellerName || '—', 'negocio-people-seller')
        : null}
      {line('Creado por', createdByName || 'Usuario actual', 'negocio-people-created-by')}
      {customerSellerText !== null
        ? line('Vendedor del cliente', customerSellerText, 'negocio-people-customer-seller')
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  line: { fontSize: 12 },
  value: { fontWeight: '600' },
});
