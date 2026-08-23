import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import type { InventoryItem } from '@/components/inventory/infrastructure/store/inventoryStore';
import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui/Card';
import { Radius, Spacing, ThemeColors, getColors } from '@/constants/theme';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface InventoryListProps {
  header: React.ReactElement;
}

export function InventoryList({ header }: InventoryListProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const styles = createStyles(colors);
  const {
    inventory,
    loading,
    refreshing,
    loadingMore,
    error,
    searchQuery,
    selectedWarehouseId,
    totalCount,
    hasMore,
    loadNextPage,
    loadInventory,
    refreshInventory,
  } = useInventory();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      void loadInventory({ page: 1 });
      return;
    }

    const timeout = setTimeout(() => {
      void loadInventory({ page: 1 });
    }, 300);

    return () => clearTimeout(timeout);
  }, [loadInventory, searchQuery]);

  const getWarehouseNames = (stockByWarehouse: InventoryItem['stock_by_warehouse']): string => {
    const warehouses = Object.values(stockByWarehouse).filter((warehouse) => warehouse.quantity > 0);
    if (warehouses.length === 0) return 'Sin bodega';
    return warehouses.map((warehouse) => warehouse.warehouse_name).join(', ');
  };

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const warehouseStock = selectedWarehouseId
      ? item.stock_by_warehouse[selectedWarehouseId]
      : null;
    const displayQuantity = warehouseStock?.quantity ?? item.total_stock;
    const displayWarehouse = selectedWarehouseId
      ? warehouseStock?.warehouse_name || 'Sin bodega'
      : getWarehouseNames(item.stock_by_warehouse);
    const warehousesWithStock = Object.values(item.stock_by_warehouse)
      .filter((warehouse) => warehouse.quantity > 0);

    return (
      <Card style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.productName}>{item.name || 'Sin nombre'}</Text>
            <Text style={styles.productSku}>SKU: {item.sku || 'N/A'}</Text>
            <Text style={styles.productBarcode}>Código: {item.barcode || 'N/A'}</Text>
            <Text style={styles.productBrand}>Marca: {item.brand_name}</Text>
            <Text style={styles.productCategory}>Categoría: {item.category_name}</Text>
            {item.color_name ? <Text style={styles.productColor}>Color: {item.color_name}</Text> : null}
            <View style={styles.warehousesList}>
              <Text style={styles.warehousesTitle}>Bodegas:</Text>
              {warehousesWithStock.map((warehouse) => (
                <View key={warehouse.warehouse_id} style={styles.warehouseItem}>
                  <Text style={styles.warehouseItemName}>{warehouse.warehouse_name}:</Text>
                  <Text style={styles.warehouseItemQuantity}>
                    {warehouse.quantity} unidad{warehouse.quantity !== 1 ? 'es' : ''}
                  </Text>
                </View>
              ))}
              {warehousesWithStock.length === 0 ? (
                <Text style={styles.warehouseItemName}>Sin stock en bodegas</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.quantityContainer}>
            <Text style={styles.quantityLabel}>Stock</Text>
            <Text style={styles.quantityValue}>{displayQuantity}</Text>
          </View>
        </View>
        {selectedWarehouseId ? (
          <View style={styles.warehouseInfo}>
            <Text style={styles.warehouseLabel}>Bodega:</Text>
            <Text style={styles.warehouseName}>{displayWarehouse}</Text>
          </View>
        ) : null}
      </Card>
    );
  };

  const emptyState = loading ? (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary.main} />
      <Text style={styles.loadingText}>Cargando inventario...</Text>
    </View>
  ) : (
    <Card style={styles.emptyCard}>
      <Text style={styles.emptyText}>
        {error
          ? `No se pudo cargar el inventario: ${error}`
          : searchQuery
            ? 'No se encontraron productos'
            : 'No hay productos en el inventario'}
      </Text>
      {error ? (
        <TouchableOpacity style={styles.retryButton} onPress={() => void loadInventory({ page: 1 })}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );

  const footer = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator size="small" color={colors.primary.main} />
      <Text style={styles.footerText}>Cargando más productos...</Text>
    </View>
  ) : error && inventory.length > 0 ? (
    <View style={styles.footer}>
      <Text style={styles.footerText}>No se pudo cargar la siguiente página.</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => void loadNextPage()}>
        <Text style={styles.retryText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  ) : inventory.length > 0 && !hasMore ? (
    <Text style={styles.endText}>Mostrando {inventory.length} de {totalCount} productos</Text>
  ) : (
    <View style={styles.bottomPadding} />
  );

  return (
    <FlatList
      testID="inventory-list"
      style={styles.container}
      contentContainerStyle={styles.content}
      data={inventory}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={<View style={styles.header}>{header}</View>}
      ListEmptyComponent={emptyState}
      ListFooterComponent={footer}
      onEndReached={() => {
        if (!error) void loadNextPage();
      }}
      onEndReachedThreshold={0.35}
      refreshing={refreshing}
      onRefresh={() => void refreshInventory()}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={7}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text.secondary,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  itemCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  productSku: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  productBarcode: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  productBrand: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  productCategory: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  productColor: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  warehousesList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  warehousesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  warehouseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 2,
  },
  warehouseItemName: {
    fontSize: 12,
    color: colors.text.secondary,
    marginRight: 4,
  },
  warehouseItemQuantity: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.info.main,
  },
  quantityContainer: { alignItems: 'flex-end' },
  quantityLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  quantityValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary.main,
  },
  warehouseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  warehouseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginRight: 8,
  },
  warehouseName: {
    fontSize: 14,
    color: colors.primary.main,
  },
  retryButton: {
    marginTop: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.control,
    backgroundColor: colors.primary.main,
  },
  retryText: {
    color: colors.primary.contrastText,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  footerText: {
    color: colors.text.secondary,
    fontSize: 13,
    textAlign: 'center',
  },
  endText: {
    color: colors.text.secondary,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  bottomPadding: { height: 20 },
});
