import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useAuthStore } from '@/components/auth/infrastructure/store/authStore';
import { useTheme, useThemeStore } from '@/components/theme';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { OfflineProvider } from '@/components/offline';
import { PrinterPickerModal } from '@/components/printing';
import { startSupabaseAuthLifecycle } from '@/lib/supabase';

// Mantener el splash screen visible hasta que la app esté lista
SplashScreen.preventAutoHideAsync();

// Captura crashes nativos (no solo errores de JS) para dejar de adivinar cuando la app
// se cierra sin dejar rastro en los logs propios. Sin DSN configurado, no hace nada.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: true,
    tracesSampleRate: 0.2,
  });
}

// Configurar las opciones de animación del splash screen solo si no estamos en Expo Go
// setOptions no funciona en Expo Go, solo en development builds y production
if (!Constants.executionEnvironment || Constants.executionEnvironment === 'standalone') {
  try {
    SplashScreen.setOptions({
      duration: 2000, // Duración mínima de 2 segundos
      fade: true,
    });
  } catch (error) {
    // Ignorar error si setOptions no está disponible (Expo Go)
    console.log('SplashScreen.setOptions no disponible en este entorno');
  }
}

function RootLayoutNav() {
  const { session, initialized, initialize } = useAuth();
  const { initializeTheme } = useTheme();
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => startSupabaseAuthLifecycle(), []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch((error) => {
      console.warn('No se pudo fijar la orientación vertical inicial:', error);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        await initialize();
        await initializeTheme();

        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (!cancelled) setAppIsReady(true);
      } catch (e: any) {
        console.error('Error durante la inicialización:', e);
        if (e?.message) console.error('Mensaje de error:', e.message);
        if (e?.stack) console.error('Stack trace:', e.stack);
        if (!cancelled) setAppIsReady(true);
      }
    }

    prepare();

    const failsafe = setTimeout(() => {
      if (cancelled) return;
      setAppIsReady(true);
      void SplashScreen.hideAsync().catch(() => undefined);
    }, 10_000);

    return () => {
      cancelled = true;
      clearTimeout(failsafe);
      useAuthStore.getState().cleanup();
      useThemeStore.getState().cleanup();
    };
  }, [initialize, initializeTheme]);

  useEffect(() => {
    if (!initialized || !appIsReady) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [initialized, appIsReady]);

  const stackAnimation = Platform.OS === 'web' ? 'none' : undefined;
  const detailAnimation = Platform.OS === 'web' ? 'none' : 'slide_from_right';

  if (!initialized && !appIsReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: stackAnimation }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="negocio/[id]" options={{ headerShown: false, animation: detailAnimation }} />
        <Stack.Screen name="ruta-cobros/[id]" options={{ headerShown: false, animation: detailAnimation }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function RootLayout() {
  const { isDark } = useTheme();
  return (
    <GestureHandlerRootView style={styles.root}>
      <OfflineProvider>
        <RootLayoutNav />
        <PrinterPickerModal />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </OfflineProvider>
    </GestureHandlerRootView>
  );
}

export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
