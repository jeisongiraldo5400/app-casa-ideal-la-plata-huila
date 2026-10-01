import { useTheme } from '@/components/theme';
import { Pagination, ScreenState, SearchField } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { useNavigateWithLoading } from '@/hooks/useNavigateWithLoading';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTransferHistory } from '../infrastructure/hooks/useTransferHistory';
import {
  TRANSFER_HISTORY_FILTERS,
  TRANSFER_HISTORY_PAGE_SIZE,
  type TransferHistoryFilterKey,
} from '../utils/transferHistory';
import { TransferHistoryRow } from './TransferHistoryRow';

type Props = {
  /** Solo consulta con la pantalla a la vista y con señal. */
  enabled: boolean;
  /** Cambia para pedir de nuevo (deslizar para actualizar). */
  refreshKey: number;
};

/**
 * «Historial»: todos los traslados que el usuario puede ver, como la lista de
 * la web, con búsqueda (número o producto), filtro por estado y páginas de 20.
 */
export function TransferHistoryView({ enabled, refreshKey }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const navigate = useNavigateWithLoading();
  const [filter, setFilter] = useState<TransferHistoryFilterKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const history = useTransferHistory({ enabled, filter, search, page });
  const { reload } = history;
  useEffect(() => {
    if (refreshKey > 0 && enabled) void reload();
  }, [refreshKey, enabled, reload]);

  const body = () => {
    if (history.error && history.rows.length === 0) {
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
    if (history.loading && history.rows.length === 0) return <ScreenState loading title="Cargando traslados…" />;
    if (history.rows.length === 0) {
      return (
        <ScreenState
          icon="inventory-2"
          variant="inline"
          title="Sin traslados"
          description={search ? `Ningún traslado coincide con «${search}».` : 'No hay traslados con este filtro.'}
        />
      );
    }
    return history.rows.map((order) => (
      <TransferHistoryRow
        key={order.id}
        order={order}
        onPress={() => navigate(`/traslado/${encodeURIComponent(order.id)}` as never)}
      />
    ));
  };

  return (
    <View style={styles.container}>
      <SearchField
        value={searchInput}
        onChangeText={setSearchInput}
        placeholder="Número (TR-…) o producto"
        autoCapitalize="none"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {TRANSFER_HISTORY_FILTERS.map((item) => {
          const selected = item.key === filter;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setFilter(item.key);
                setPage(1);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary.main : colors.background.paper,
                  borderColor: selected ? colors.primary.main : colors.divider,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: selected ? colors.primary.contrastText : colors.text.primary }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {history.totalCount > 0 ? (
        <Text style={[styles.count, { color: colors.text.secondary }]}>
          {history.totalCount} traslado{history.totalCount === 1 ? '' : 's'}
        </Text>
      ) : null}
      {history.error && history.rows.length > 0 ? (
        <Text style={[styles.count, { color: colors.error.main }]}>{history.error}</Text>
      ) : null}
      {body()}
      {history.totalCount > TRANSFER_HISTORY_PAGE_SIZE ? (
        <Pagination
          page={page}
          pageSize={TRANSFER_HISTORY_PAGE_SIZE}
          total={history.totalCount}
          onChange={setPage}
          itemLabel="traslados"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  chips: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  chip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  chipText: { ...Typography.bodySmallStrong },
  count: { ...Typography.caption },
});
