import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors, getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
  const { initializeTheme, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const colors = getColors(isDark);
  const [appIsReady, setAppIsReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Inicializar autenticación y tema
        await initialize();
        await initializeTheme();
        
        // Esperar un tiempo mínimo para que el splash screen se vea bien
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Marcar la app como lista
        setAppIsReady(true);
      } catch (e) {
        console.warn(e);
        // Aún así marcar como lista después de un delay mínimo
        await new Promise(resolve => setTimeout(resolve, 2000));
        setAppIsReady(true);
      }
    }
    prepare();
  }, [initialize, initializeTheme]);

  useEffect(() => {
    if (loading || !appIsReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Realizar la navegación
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
    
    // Esperar un momento para que la navegación se complete antes de ocultar el splash
    setTimeout(() => {
      setNavigationReady(true);
    }, 500);
  }, [session, loading, segments, router, appIsReady]);

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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const { isDark } = useTheme();
  return (
    <>
      <RootLayoutNav />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
