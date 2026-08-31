import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useAuthStore } from '@/components/auth/infrastructure/store/authStore';
import { useTheme, useThemeStore } from '@/components/theme';
import Constants from 'expo-constants';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

// Mantener el splash screen visible hasta que la app esté lista
SplashScreen.preventAutoHideAsync();

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
  const { session, loading, initialize } = useAuth();
  const { initializeTheme } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [appIsReady, setAppIsReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);

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
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!cancelled) setAppIsReady(true);
      }
    }

    prepare();

    return () => {
      cancelled = true;
      useAuthStore.getState().cleanup();
      useThemeStore.getState().cleanup();
    };
  }, [initialize, initializeTheme]);

  useEffect(() => {
    if (loading || !appIsReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Solo redirigir cuando el grupo de rutas no coincide con la sesión.
    // Evita remounts del login que impiden escribir en los inputs.
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }

    const timer = setTimeout(() => {
      setNavigationReady(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [session, loading, segments, appIsReady]);

  useEffect(() => {
    // Solo ocultar el splash screen cuando todo esté listo: inicialización, navegación y carga completa
    if (appIsReady && navigationReady && !loading) {
      // Pequeño delay adicional para asegurar que la pantalla esté renderizada
      setTimeout(async () => {
        await SplashScreen.hideAsync();
      }, 200);
    }
  }, [appIsReady, navigationReady, loading]);

  // No mostrar loading container mientras se carga, dejar que el splash screen se muestre
  // El splash screen se ocultará automáticamente cuando termine la inicialización

  const stackAnimation = Platform.OS === 'web' ? 'none' : undefined;
  const detailAnimation = Platform.OS === 'web' ? 'none' : 'slide_from_right';

  return (
    <Stack screenOptions={{ headerShown: false, animation: stackAnimation }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="negocio/[id]" options={{ headerShown: false, animation: detailAnimation }} />
      <Stack.Screen name="ruta-cobros/[id]" options={{ headerShown: false, animation: detailAnimation }} />
    </Stack>
  );
}

export default function RootLayout() {
  const { isDark } = useTheme();
  return (
    <GestureHandlerRootView style={styles.root}>
      <RootLayoutNav />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
