import { OfflineDataScreen } from '@/components/offline/OfflineDataScreen';
import { useTheme } from '@/components/theme';
import { BackButton, StackHeader } from '@/components/ui';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Typography, getColors } from '@/constants/theme';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Stack } from 'expo-router';
import React from 'react';

/**
 * «Preparar el teléfono»: se abre desde Perfil → Datos sin conexión y desde
 * el aviso «Prepara el teléfono antes de salir».
 * El Stack raíz no la declara (no hace falta tocar `_layout.tsx`): el header
 * se define aquí con el mismo `StackHeader` de las demás pantallas de detalle.
 */
export default function DatosSinConexionScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <ScreenErrorBoundary screen="Datos sin conexión">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Preparar el teléfono',
          header: (props: NativeStackHeaderProps) => <StackHeader {...props} />,
          headerLeft: () => <BackButton />,
          headerStyle: { backgroundColor: colors.background.default },
          headerTintColor: colors.text.primary,
          headerTitleStyle: { ...Typography.section },
          headerTitleAlign: 'left',
          headerShadowVisible: false,
        }}
      />
      <OfflineDataScreen />
    </ScreenErrorBoundary>
  );
}
