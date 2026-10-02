import { TransferSummaryCard } from '@/components/transfers/components/TransferSummaryCard';
import type { TransferListPage } from '@/components/transfers/utils/transferModel';
import { useTheme } from '@/components/theme';
import { ScreenState } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useNavigateWithLoading } from '@/hooks/useNavigateWithLoading';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWarehouseTransfers } from '../infrastructure/hooks/useWarehouseTransfers';
import { transferDetailHref } from '../utils/warehouseRoutes';

type Props = { warehouseId: string; enabled: boolean; online: boolean };

/**
 * Pestaña «En camino»: traslados que vienen hacia la bodega (en tránsito,
 * recibidos en parte o con diferencias) y los que esperan despacho desde
 * ella. Tocar uno abre su detalle en Traslados.
 */
export function WarehouseTransfersView({ warehouseId, enabled, online }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const navigate = useNavigateWithLoading();
  const state = useWarehouseTransfers({ warehouseId, enabled });

  const section = (title: string, page: TransferListPage, emptyText: string) => (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text.primary }]}>
        {title} ({page.totalCount})
      </Text>
      {page.rows.length === 0 ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]}>{emptyText}</Text>
      ) : (
        page.rows.map((order) => (
          <TransferSummaryCard
            key={order.id}
            order={order}
            onPress={() => navigate(transferDetailHref(order.id) as never)}
          />
        ))
      )}
      {page.totalCount > page.rows.length ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]}>
          Mostrando {page.rows.length} de {page.totalCount}. Los demás están en Traslados.
        </Text>
      ) : null}
    </View>
  );

  const body = () => {
    if (!state.data) {
      if (state.error) {
        return (
          <ScreenState
            tone="error"
            title="No se pudieron cargar los traslados"
            description={state.error}
            actionLabel="Reintentar"
            onAction={() => void state.reload()}
          />
        );
      }
      if (!online) {
        return (
          <ScreenState tone="warning" icon="wifi-off" title="Sin señal" description="Los traslados se consultan con conexión." />
        );
      }
      return <ScreenState loading title="Cargando traslados…" />;
    }
    return (
      <>
        {section('Llegan a esta bodega', state.data.incoming, 'No hay traslados en camino hacia esta bodega.')}
        {section('Por despachar desde aquí', state.data.pendingDispatch, 'No hay traslados esperando despacho.')}
      </>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={state.loading && Boolean(state.data)}
          onRefresh={() => (online ? void state.reload() : undefined)}
        />
      }
    >
      {state.data && state.error ? (
        <Text style={[styles.caption, { color: colors.error.main }]}>{state.error}</Text>
      ) : null}
      {body()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl * 2, gap: Spacing.xl },
  section: { gap: Spacing.md },
  title: { ...Typography.section },
  caption: { ...Typography.caption },
});
