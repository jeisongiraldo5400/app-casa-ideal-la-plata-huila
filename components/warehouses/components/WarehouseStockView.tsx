import { useTheme } from '@/components/theme';
import { ListCard, ScreenState, SearchField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useWarehouseStock } from '../infrastructure/hooks/useWarehouseStock';
import { formatUnits } from '../utils/warehouseHistory';
import type { WarehouseStockRow } from '../utils/warehouseModel';
import { ListFooter } from './ListFooter';

type Props = { warehouseId: string; enabled: boolean; online: boolean };

/** Pestaña «Productos»: existencias de la bodega con buscador (sin tildes) y páginas de 30. */
export function WarehouseStockView({ warehouseId, enabled, online }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const stock = useWarehouseStock({ warehouseId, search, enabled });

  const empty = () => {
    if (stock.error) {
      return (
        <ScreenState
          tone="error"
          title="No se pudieron cargar los productos"
          description={stock.error}
          actionLabel="Reintentar"
          onAction={() => void stock.reload()}
        />
      );
    }
    if (!stock.loaded) {
      if (!online) {
        return (
          <ScreenState
            tone="warning"
            icon="wifi-off"
            title="Sin señal"
            description="Las existencias se consultan con conexión."
          />
        );
      }
      return <ScreenState loading title="Cargando productos…" />;
    }
    return (
      <ScreenState
        icon="inventory-2"
        variant="inline"
        title="Sin productos"
        description={search ? `Ningún producto coincide con «${search}».` : 'Esta bodega no tiene existencias.'}
      />
    );
  };

  return (
    <FlatList
      data={stock.rows}
      keyExtractor={(row) => row.productId}
      renderItem={({ item }) => <StockRow row={item} />}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <SearchField
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Nombre, SKU o código de barras"
            autoCapitalize="none"
          />
          {stock.error && stock.rows.length > 0 ? (
            <Text style={[styles.caption, { color: colors.error.main }]}>{stock.error}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty()}
      ListFooterComponent={
        stock.rows.length > 0 ? (
          <ListFooter loadingMore={stock.loadingMore} shown={stock.rows.length} total={stock.totalCount} itemLabel="productos" />
        ) : null
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (online) void stock.loadMore();
      }}
      refreshControl={
        <RefreshControl
          refreshing={stock.loading && stock.rows.length > 0}
          onRefresh={() => (online ? void stock.reload() : undefined)}
        />
      }
    />
  );
}

function StockRow({ row }: { row: WarehouseStockRow }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const codes = [row.sku ? `SKU ${row.sku}` : null, row.barcode].filter(Boolean).join(' · ');
  const negative = row.quantity < 0;
  return (
    <ListCard
      accessibilityLabel={`${row.name}: ${formatUnits(row.quantity)} en bodega${
        row.incoming > 0 ? `, ${formatUnits(row.incoming)} en camino` : ''
      }`}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>
            {row.name}
          </Text>
          {codes ? <Text style={[styles.caption, { color: colors.text.secondary }]}>{codes}</Text> : null}
        </View>
        <View style={styles.quantities}>
          <Text style={[styles.quantity, { color: negative ? colors.error.main : colors.text.primary }]}>
            {formatUnits(row.quantity)}
          </Text>
          <Text style={[styles.caption, { color: colors.text.secondary }]}>{row.quantity === 1 ? 'unidad' : 'unidades'}</Text>
          {row.incoming > 0 ? (
            <Text style={[styles.incoming, { color: colors.info.main }]}>{`+${formatUnits(row.incoming)} en camino`}</Text>
          ) : null}
        </View>
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl * 2, gap: Spacing.md },
  header: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  info: { flex: 1, gap: 2 },
  name: { ...Typography.bodySmallStrong },
  quantities: { alignItems: 'flex-end' },
  quantity: { ...Typography.section },
  incoming: { ...Typography.metadata },
  caption: { ...Typography.caption },
});
