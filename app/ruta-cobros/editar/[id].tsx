import { RouteBuilderScreen } from '@/components/collection-routes/RouteBuilderScreen';
import { useTheme } from '@/components/theme';
import { BackButton, StackHeader } from '@/components/ui';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Typography, getColors } from '@/constants/theme';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

/**
 * Editar las paradas de una ruta en borrador o en curso (agregar, quitar,
 * reordenar). Pantalla de pila: no conserva estado entre rutas como la pestaña
 * de crear. El Stack raíz no la declara; el header se define aquí.
 */
export default function EditCollectionRouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <ScreenErrorBoundary screen="Editar ruta de cobro">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Editar paradas',
          header: (props: NativeStackHeaderProps) => <StackHeader {...props} />,
          headerLeft: () => <BackButton />,
          headerStyle: { backgroundColor: colors.background.default },
          headerTintColor: colors.text.primary,
          headerTitleStyle: { ...Typography.section },
          headerTitleAlign: 'left',
          headerShadowVisible: false,
        }}
      />
      {id ? <RouteBuilderScreen editRouteId={id} /> : null}
    </ScreenErrorBoundary>
  );
}
