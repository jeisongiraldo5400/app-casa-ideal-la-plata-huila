import { useTheme } from '@/components/theme';
import { ScreenState } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useNavigateWithLoading } from '@/hooks/useNavigateWithLoading';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useIsFocused } from '@react-navigation/native';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { useMyWarehouses } from '../infrastructure/hooks/useMyWarehouses';
import { warehouseDetailHref } from '../utils/warehouseRoutes';
import {
  EMPTY_WAREHOUSES_MESSAGE,
  OFFLINE_WAREHOUSES_MESSAGE,
  WAREHOUSES_UNAVAILABLE_MESSAGE,
} from '../utils/warehouseTexts';
import { WarehouseCard } from './WarehouseCard';

/**
 * Lista «Bodegas»: el admin ve todas; los demás solo aquellas de las que son
 * Responsables (encargados). Solo con señal; al volver a la vista se refresca.
 */
export function WarehousesScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const navigate = useNavigateWithLoading();
  const focused = useIsFocused();
  const online = useNetworkStatus();
  const state = useMyWarehouses({ enabled: focused && online });
  const warehouses = state.data?.warehouses ?? [];

  const body = () => {
    if (state.unavailable) {
      return (
        <ScreenState tone="warning" icon="update" title="Bodegas aún no disponible" description={WAREHOUSES_UNAVAILABLE_MESSAGE} />
      );
    }
    if (!state.data) {
      if (!online) {
        return (
          <ScreenState
            tone="warning"
            icon="wifi-off"
            title="Sin señal"
            description="Las bodegas se consultan con conexión. Vuelve a intentarlo cuando tengas señal."
          />
        );
      }
      if (state.error) {
        return (
          <ScreenState
            tone="error"
            title="No se pudieron cargar las bodegas"
            description={state.error}
            actionLabel="Reintentar"
            onAction={() => void state.reload()}
          />
        );
      }
      return <ScreenState loading title="Cargando bodegas…" />;
    }
    if (warehouses.length === 0) {
      return <ScreenState icon="warehouse" title="Sin bodegas asignadas" description={EMPTY_WAREHOUSES_MESSAGE} />;
    }
    return warehouses.map((warehouse) => (
      <WarehouseCard
        key={warehouse.id}
        warehouse={warehouse}
        onPress={() => navigate(warehouseDetailHref(warehouse) as never)}
      />
    ));
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={state.loading && Boolean(state.data)}
          onRefresh={() => (online ? void state.reload() : undefined)}
        />
      }
    >
      {state.data && warehouses.length > 0 ? (
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          {state.data.isAdmin
            ? 'Como administrador ves todas las bodegas.'
            : `Eres responsable de ${warehouses.length} bodega${warehouses.length === 1 ? '' : 's'}.`}
        </Text>
      ) : null}
      {state.data && !online ? (
        <Text style={[styles.notice, { color: colors.warning.dark }]}>{OFFLINE_WAREHOUSES_MESSAGE}</Text>
      ) : null}
      {state.data && state.error ? (
        <Text style={[styles.notice, { color: colors.error.main }]}>{state.error}</Text>
      ) : null}
      {body()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl * 2, gap: Spacing.md },
  subtitle: { ...Typography.bodySmall },
  notice: { ...Typography.caption },
});
