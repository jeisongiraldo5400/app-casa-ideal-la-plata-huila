import { useTheme } from '@/components/theme';
import { BackButton, ScreenErrorBoundary, ScreenState } from '@/components/ui';
import { CostosOnlyNegocioScreen } from '@/components/negocios/components/CostosOnlyNegocioView';
import { Spacing, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { costAlertAccessFor } from '@/lib/costos/access';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Se abre al tocar el aviso de venta bajo costo o bajo margen (`cost_alert`,
 * 20261231620000). Es la única pantalla del teléfono, junto con «Últimas
 * compras», que muestra costo y ganancia de un negocio: el detalle del negocio
 * nunca los muestra, aunque el usuario tenga el perfil «costos».
 * Solo el perfil «costos»; requiere señal y no guarda nada en el teléfono.
 */
export default function CostAlertScreen() {
  return (
    <ScreenErrorBoundary screen="Aviso de costos">
      <CostAlertRouter />
    </ScreenErrorBoundary>
  );
}

function CostAlertRouter() {
  const { negocioId } = useLocalSearchParams<{ negocioId: string }>();
  const { roles, loading } = useUserRoles();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const access = costAlertAccessFor(
    roles.map((userRole) => userRole.role?.nombre ?? ''),
    { rolesLoading: loading }
  );

  if (access === 'permitido' && negocioId) return <CostosOnlyNegocioScreen negocioId={negocioId} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={{ title: 'Costo del negocio', headerLeft: () => <BackButton /> }} />
      {access === 'cargando' ? (
        <ScreenState loading title="Cargando…" style={styles.state} />
      ) : (
        <ScreenState
          icon="lock-outline"
          tone="warning"
          title="Sin acceso"
          description={
            negocioId
              ? 'Este aviso es solo para el perfil Costos.'
              : 'El aviso no trae el negocio.'
          }
          style={styles.state}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  state: { margin: Spacing.lg },
});
