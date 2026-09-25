import { MisCobrosScreen } from '@/components/cartera/mis-cobros/MisCobrosScreen';
import { useTheme } from '@/components/theme';
import { BackButton, StackHeader } from '@/components/ui';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Typography, getColors } from '@/constants/theme';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Stack } from 'expo-router';
import React from 'react';

/**
 * «Mis cobros»: se abre desde Cartera. Como «Preparar el teléfono», el Stack
 * raíz no la declara: el header se define aquí con el mismo `StackHeader`.
 */
export default function MisCobrosRoute() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <ScreenErrorBoundary screen="Mis cobros">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Mis cobros',
          header: (props: NativeStackHeaderProps) => <StackHeader {...props} />,
          headerLeft: () => <BackButton />,
          headerStyle: { backgroundColor: colors.background.default },
          headerTintColor: colors.text.primary,
          headerTitleStyle: { ...Typography.section },
          headerTitleAlign: 'left',
          headerShadowVisible: false,
        }}
      />
      <MisCobrosScreen />
    </ScreenErrorBoundary>
  );
}
