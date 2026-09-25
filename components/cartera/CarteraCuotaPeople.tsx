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
 * «Vendedor (dueño del cliente)», «Creado por» y, solo si es otra persona,
 * «Vendedor registrado en el negocio» (ver `lib/cartera/carteraPeople`).
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
