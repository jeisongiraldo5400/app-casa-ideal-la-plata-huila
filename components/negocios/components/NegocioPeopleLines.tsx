import { StyleSheet, Text, View } from 'react-native';

type ThemeColors = {
  text: { primary: string; secondary: string };
};

type Props = {
  createdByName: string | null;
  /**
   * Texto de «Vendedor (dueño del cliente)». `null` = no hay cliente elegido y
   * la línea se oculta.
   */
  sellerOwnerText: string | null;
  colors: ThemeColors;
};

/**
 * Al crear un negocio intervienen dos personas (20261206120000):
 * - Vendedor (dueño del cliente) (`customers.seller_id`): el vendedor del
 *   negocio es siempre el dueño del cliente; no se elige aquí, salvo que un
 *   administrador asigne uno a un cliente que no lo tiene.
 * - Creado por (`negocios.created_by`): quien lo registra; se pone solo.
 * Estas líneas son de solo lectura.
 */
export function NegocioPeopleLines({ createdByName, sellerOwnerText, colors }: Props) {
  const line = (label: string, value: string, testID: string) => (
    <Text testID={testID} style={[styles.line, { color: colors.text.secondary }]}>
      {label}: <Text style={[styles.value, { color: colors.text.primary }]}>{value}</Text>
    </Text>
  );
  return (
    <View testID="negocio-people-lines" style={styles.wrap}>
      {sellerOwnerText !== null
        ? line('Vendedor (dueño del cliente)', sellerOwnerText, 'negocio-people-seller')
        : null}
      {line('Creado por', createdByName || 'Usuario actual', 'negocio-people-created-by')}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  line: { fontSize: 12 },
  value: { fontWeight: '600' },
});
