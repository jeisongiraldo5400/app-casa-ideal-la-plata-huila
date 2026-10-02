import { useTheme } from '@/components/theme';
import { ScreenState } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useWarehouseHistory } from '../infrastructure/hooks/useWarehouseHistory';
import {
  HISTORY_DATE_PRESETS,
  HISTORY_TYPE_FILTERS,
  type HistoryDatePreset,
  type HistoryTypeFilter,
} from '../utils/warehouseHistory';
import { FilterChips } from './FilterChips';
import { ListFooter } from './ListFooter';
import { WarehouseHistoryRow } from './WarehouseHistoryRow';

type Props = { warehouseId: string; enabled: boolean; online: boolean };

/** Pestaña «Historial»: movimientos de la bodega, filtro por tipo y por fechas, páginas de 20. */
export function WarehouseHistoryView({ warehouseId, enabled, online }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [typeFilter, setTypeFilter] = useState<HistoryTypeFilter>('all');
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('all');
  const history = useWarehouseHistory({ warehouseId, typeFilter, datePreset, enabled });

  const empty = () => {
    if (history.error) {
      return (
        <ScreenState
          tone="error"
          title="No se pudo cargar el historial"
          description={history.error}
          actionLabel="Reintentar"
          onAction={() => void history.reload()}
        />
      );
    }
    if (!history.loaded) {
      if (!online) {
        return <ScreenState tone="warning" icon="wifi-off" title="Sin señal" description="El historial se consulta con conexión." />;
      }
      return <ScreenState loading title="Cargando historial…" />;
    }
    return (
      <ScreenState
        icon="history"
        variant="inline"
        title="Sin movimientos"
        description="No hay movimientos con estos filtros."
      />
    );
  };

  return (
    <FlatList
      data={history.rows}
      keyExtractor={(row, index) => row.key || String(index)}
      renderItem={({ item }) => <WarehouseHistoryRow row={item} />}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <FilterChips items={HISTORY_TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
          <FilterChips items={HISTORY_DATE_PRESETS} value={datePreset} onChange={setDatePreset} />
          {history.error && history.rows.length > 0 ? (
            <Text style={[styles.caption, { color: colors.error.main }]}>{history.error}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty()}
      ListFooterComponent={
        history.rows.length > 0 ? (
          <ListFooter
            loadingMore={history.loadingMore}
            shown={history.rows.length}
            total={history.totalCount}
            itemLabel="movimientos"
          />
        ) : null
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (online) void history.loadMore();
      }}
      refreshControl={
        <RefreshControl
          refreshing={history.loading && history.rows.length > 0}
          onRefresh={() => (online ? void history.reload() : undefined)}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl * 2, gap: Spacing.md },
  header: { gap: Spacing.xs },
  caption: { ...Typography.caption },
});
