import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components/ui';
import { IconSize, Spacing, Typography, type ThemeColors } from '@/constants/theme';
import type { RouteStopPago } from './useRouteStopPago';

type Props = {
  routeStop: Pick<RouteStopPago, 'stopId' | 'position' | 'suggestion' | 'link'>;
  /** Solo se ofrece vincular si la persona puede cobrar este negocio. */
  canPay: boolean;
  colors: ThemeColors;
};

/**
 * Aviso del cobro en ruta en el detalle del negocio: si el próximo cobro
 * completa una parada, se dice; si el negocio es la parada actual de la ruta
 * en curso pero se entró sin ella, se ofrece contarlo en la ruta.
 */
export function RouteStopPagoBanner({ routeStop, canPay, colors }: Props) {
  if (!canPay) return null;
  if (routeStop.stopId) {
    return (
      <Card variant="muted" style={styles.card}>
        <View style={styles.row} testID="route-stop-pago-linked">
          <MaterialIcons name="near-me" size={IconSize.md} color={colors.primary.main} />
          <Text style={[styles.text, { color: colors.text.primary }]}>
            {routeStop.position
              ? `Cobro de la parada ${routeStop.position} de tu ruta: el pago completa la visita.`
              : 'Cobro de tu ruta: el pago completa la visita.'}
          </Text>
        </View>
      </Card>
    );
  }
  if (!routeStop.suggestion) return null;
  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.row} testID="route-stop-pago-suggestion">
        <MaterialIcons name="near-me" size={IconSize.md} color={colors.primary.main} />
        <Text style={[styles.text, { color: colors.text.primary }]}>
          Este negocio es la parada actual ({routeStop.suggestion.position}) de tu ruta en curso.
        </Text>
      </View>
      <Button
        title="Contar el cobro en la ruta"
        variant="outline"
        size="sm"
        icon="near-me"
        onPress={routeStop.link}
        accessibilityLabel="Contar el cobro en la ruta"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.lg, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  text: { ...Typography.caption, flex: 1 },
});
