import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { routeOfflineLabel, type RouteOfflineStatus } from '@/lib/collection-routes/routeOffline';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  status: RouteOfflineStatus | null;
  online: boolean;
  downloading: boolean;
  /** Recién creada o editada: se insiste en descargarla. */
  highlight?: boolean;
  onDownload: () => void;
};

/**
 * ¿Se puede trabajar la ruta sin señal? Muestra «Guardada en el teléfono ·
 * hora» o «Pendiente de descargar» y el botón para descargarla. Nada baja
 * solo: sin pulsar el botón la ruta no estará en el teléfono.
 */
export function RouteOfflineCard({ status, online, downloading, highlight = false, onDownload }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (!status) return null;
  const saved = status.state === 'guardada';
  const tone = saved ? colors.success.main : colors.warning.main;
  const missing = status.missingNegocioNumeros.filter((numero) => numero > 0);

  return (
    <View
      testID="route-offline-card"
      style={[
        styles.card,
        { backgroundColor: colors.background.paper, borderColor: highlight && !saved ? colors.warning.main : colors.divider },
      ]}>
      <View style={styles.header}>
        <MaterialIcons name={saved ? 'offline-pin' : 'cloud-download'} size={24} color={tone} />
        <Text testID="route-offline-label" style={[styles.label, { color: colors.text.primary }]}>
          {routeOfflineLabel(status)}
        </Text>
      </View>
      {!saved ? (
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
          {highlight
            ? 'Ruta guardada. Descárgala ahora si vas a trabajar sin señal: sin descargar no podrás verla ni cobrar sus paradas sin conexión.'
            : 'Sin descargarla no podrás ver la ruta ni cobrar sus paradas sin conexión.'}
        </Text>
      ) : null}
      {missing.length ? (
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
          Sin datos en el teléfono: {missing.slice(0, 6).map(formatNegocioCodigo).join(', ')}
          {missing.length > 6 ? ` y ${missing.length - 6} más` : ''}.
        </Text>
      ) : null}
      {!saved || online ? (
        <TouchableOpacity
          testID="route-offline-download"
          accessibilityRole="button"
          disabled={!online || downloading}
          accessibilityState={{ disabled: !online || downloading }}
          onPress={onDownload}
          style={[
            styles.button,
            saved
              ? { borderColor: colors.primary.main, borderWidth: 1 }
              : { backgroundColor: colors.primary.main },
            { opacity: online ? 1 : 0.6 },
          ]}>
          {downloading ? (
            <ActivityIndicator color={saved ? colors.primary.main : '#fff'} />
          ) : (
            <>
              <MaterialIcons name="download" size={19} color={saved ? colors.primary.main : '#fff'} />
              <Text style={{ color: saved ? colors.primary.main : '#fff', fontWeight: '900' }}>
                {!online
                  ? 'Sin señal para descargar'
                  : saved
                    ? 'Volver a descargar'
                    : 'Descargar ruta para usar sin señal'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 14, borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { flex: 1, fontWeight: '800' },
  button: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
});
