import { InventoryList } from '@/components/inventory/components/InventoryList';
import { SearchBar } from '@/components/inventory/components/SearchBar';
import { WarehouseFilter } from '@/components/inventory/components/WarehouseFilter';
import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { useTheme } from '@/components/theme';
import { ScreenHeader } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function InventoryScreen() {
  const { loadWarehouses, loading, inventory, searchQuery, setPage } = useInventory();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  const handleRefresh = () => {
    setPage(1);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background.default }]} edges={['top']}>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }>
      <ScreenHeader
        icon="inventory-2"
        title="Inventario"
        subtitle={searchQuery ? `${inventory.length} resultados para tu búsqueda` : 'Existencias disponibles por bodega'}
      />

      <WarehouseFilter />
      <SearchBar />

      <InventoryList />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
});
