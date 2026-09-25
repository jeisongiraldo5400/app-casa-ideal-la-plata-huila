import { StyleSheet, Text, View } from 'react-native';
import { carteraPeopleLines, type CarteraPeopleSource } from '@/lib/cartera/carteraPeople';

type Props = {
  row: CarteraPeopleSource;
  colors: { text: { primary: string; secondary: string } };
  /** Tamaño de letra; la tarjeta de cartera usa 12 y la ficha del negocio 13. */
  fontSize?: number;
  testID?: string;
};

/**
 * Personas de una cuota o de un negocio, cada una con su rótulo:
 * «Registrado por», «Vendedor del negocio» (solo si es otra persona) y
 * «Vendedor del cliente». Antes la cartera solo sugería al vendedor del
 * negocio, que suele ser quien lo registró, y se leía como si el cliente fuera
 * suyo (ver `lib/cartera/carteraPeople`).
 */
export function CarteraCuotaPeople({ row, colors, fontSize = 12, testID = 'cartera-people' }: Props) {
  return (
    <View testID={testID} style={styles.wrap}>
      {carteraPeopleLines(row).map((line) => (
        <Text
          key={line.key}
          testID={`${testID}-${line.key}`}
          numberOfLines={1}
          style={{ color: colors.text.secondary, fontSize }}
        >
          {line.label}: <Text style={[styles.value, { color: colors.text.primary }]}>{line.value}</Text>
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 1, marginTop: 2 },
  value: { fontWeight: '600' },
});
