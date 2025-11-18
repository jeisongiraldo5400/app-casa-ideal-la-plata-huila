import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { InventoryList } from '@/components/inventory/components/InventoryList';
import { WarehouseFilter } from '@/components/inventory/components/WarehouseFilter';
import { SearchBar } from '@/components/inventory/components/SearchBar';
import { Colors } from '@/constants/theme';

export default function InventoryScreen() {
  const { loadInventory, loadWarehouses, loading, inventory } = useInventory();

  useEffect(() => {
    loadWarehouses();
    loadInventory();
  }, []);

  const handleRefresh = () => {
    loadInventory();
  };

  const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }>
      <View style={styles.header}>
        <Text style={styles.title}>Inventario</Text>
        <Text style={styles.subtitle}>
          {inventory.length} producto(s) - {totalItems} unidad(es) en total
        </Text>
      </View>

      <WarehouseFilter />
      <SearchBar />

      <InventoryList />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.default,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
  },
});


