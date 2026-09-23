import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { useDelayedVisible } from '@/hooks/useDelayedVisible';
import { LOADING_SHOW_DELAY_MS, selectIsBusy, useLoadingStore } from '@/lib/ui/loadingStore';
import { usePathname } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BAR_HEIGHT = 3;
/** Fracción del ancho que ocupa el trazo que recorre la barra. */
const TRACK_RATIO = 0.4;
const SWEEP_MS = 900;

/**
 * Aviso de carga único de la app: una barra delgada arriba y una pastilla
 * discreta con "Cargando…".
 *
 * Por qué no una cortina: el usuario en campo necesita poder seguir tocando
 * (volver atrás, por ejemplo) mientras el servidor responde; tapar la pantalla
 * castiga la red lenta dos veces. Por eso el aviso es `pointerEvents="none"` y
 * no captura ningún toque.
 *
 * Se monta una sola vez en `app/_layout.tsx`; ninguna pantalla lo renderiza.
 */
export function GlobalLoadingBar() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const busy = useLoadingStore(selectIsBusy);
  const endNavigation = useLoadingStore((state) => state.endNavigation);
  const visible = useDelayedVisible(busy, LOADING_SHOW_DELAY_MS);
  const sweep = useRef(new Animated.Value(0)).current;

  // La ruta ya cambió: la pantalla destino está montada y, si pide datos, ya
  // registró su propio indicador. A partir de aquí manda la carga de la
  // pantalla, no la navegación. El timeout deja correr los efectos de montaje
  // del destino antes de cerrar el tramo de navegación.
  useEffect(() => {
    const timer = setTimeout(() => endNavigation(), 0);
    return () => clearTimeout(timer);
  }, [pathname, endNavigation]);

  useEffect(() => {
    if (!visible) return;
    sweep.setValue(0);
    const animation = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [visible, sweep]);

  if (!visible) return null;

  const trackWidth = Math.max(width * TRACK_RATIO, 80);
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackWidth, width],
  });

  return (
    <View pointerEvents="none" style={styles.overlay} accessibilityLiveRegion="polite">
      <View style={[styles.bar, { backgroundColor: `${colors.primary.main}22` }]}>
        <Animated.View
          style={[
            styles.track,
            { width: trackWidth, backgroundColor: colors.primary.main, transform: [{ translateX }] },
          ]}
        />
      </View>
      <View style={styles.pillRow} pointerEvents="none">
        <View
          style={[
            styles.pill,
            { backgroundColor: colors.background.paper, borderColor: colors.divider, marginTop: insets.top + Spacing.sm },
          ]}>
          <ActivityIndicator size="small" color={colors.primary.main} />
          <Text style={[styles.pillText, { color: colors.text.secondary }]} accessibilityRole="text">
            Cargando…
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  bar: { height: BAR_HEIGHT, overflow: 'hidden' },
  track: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT },
  pillRow: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    ...Shadows.card,
  },
  pillText: { ...Typography.metadata },
});
