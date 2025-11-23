import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors, getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

// Mantener el splash screen visible hasta que la app esté lista
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, loading, initialize } = useAuth();
  const { initializeTheme, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const colors = getColors(isDark);

  useEffect(() => {
    async function prepare() {
      try {
        await initialize();
        await initializeTheme();
      } catch (e) {
        console.warn(e);
      } finally {
        // Ocultar el splash screen cuando todo esté listo
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, [initialize, initializeTheme]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background.default }]}>
        <ActivityIndicator size="large" color={colors.primary.main} />
      </View>
    );
  }

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
