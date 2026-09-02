import { InventoryList } from '@/components/inventory/components/InventoryList';
import { SearchBar } from '@/components/inventory/components/SearchBar';
import { WarehouseFilter } from '@/components/inventory/components/WarehouseFilter';
import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { useTheme } from '@/components/theme';
import { ScreenHeader } from '@/components/ui';
import { getColors } from '@/constants/theme';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function InventoryScreen() {
  return (
    <ScreenErrorBoundary screen="Inventario">
      <InventoryScreenInner />
    </ScreenErrorBoundary>
  );
}

function InventoryScreenInner() {
  const { loadWarehouses, inventory, totalCount, searchQuery } = useInventory();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background.default }]} edges={['top']}>
      <InventoryList
        header={(
          <>
            <ScreenHeader
              icon="inventory-2"
              title="Inventario"
              subtitle={searchQuery
                ? `${totalCount || inventory.length} resultados para tu búsqueda`
                : 'Existencias disponibles por bodega'}
            />
            <WarehouseFilter />
            <SearchBar />
          </>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
