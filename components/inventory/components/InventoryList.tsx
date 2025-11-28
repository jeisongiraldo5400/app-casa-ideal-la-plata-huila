import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function InventoryList() {
  const {
    inventory,
    loading,
    searchQuery,
    selectedWarehouseId,
    hasMore,
    loadNextPage,
    loadInventory,
  } = useInventory();

  // Recargar cuando cambia el searchQuery (con debounce manejado en el componente padre)
  useEffect(() => {
    loadInventory();
  }, [searchQuery]);

  if (loading && inventory.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
        <Text style={styles.loadingText}>Cargando inventario...</Text>
      </View>
    );
  }

  if (inventory.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyText}>
          {searchQuery ? 'No se encontraron productos' : 'No hay productos en el inventario'}
        </Text>
      </Card>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {inventory.map((item) => {
        // Si hay bodega seleccionada, mostrar solo el stock de esa bodega
        const warehouseStock = selectedWarehouseId
          ? item.stock_by_warehouse[selectedWarehouseId]
          : null;

        const displayQuantity = warehouseStock?.quantity || item.total_stock;
        const displayWarehouse = warehouseStock?.warehouse_name || 'Todas las bodegas';

        return (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={styles.itemInfo}>
                <Text style={styles.productName}>{item.name || 'Sin nombre'}</Text>
                <Text style={styles.productSku}>SKU: {item.sku || 'N/A'}</Text>
                <Text style={styles.productBarcode}>Código: {item.barcode || 'N/A'}</Text>
                <Text style={styles.productBrand}>Marca: {item.brand_name}</Text>
                <Text style={styles.productCategory}>Categoría: {item.category_name}</Text>
              </View>
              <View style={styles.quantityContainer}>
                <Text style={styles.quantityLabel}>Stock</Text>
                <Text style={styles.quantityValue}>{displayQuantity}</Text>
              </View>
            </View>
            <View style={styles.warehouseInfo}>
              <Text style={styles.warehouseLabel}>Bodega:</Text>
              <Text style={styles.warehouseName}>{displayWarehouse}</Text>
            </View>
          </Card>
        );
      })}

      {/* Botón para cargar más */}
      {hasMore && (
        <TouchableOpacity
          style={styles.loadMoreButton}
          onPress={loadNextPage}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary.main} />
          ) : (
            <Text style={styles.loadMoreText}>Cargar más productos</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.text.secondary,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  itemCard: {
    marginBottom: 12,
    padding: 16,
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
    color: Colors.text.primary,
    marginBottom: 4,
  },
  productSku: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  productBarcode: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  productBrand: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  productCategory: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  quantityContainer: {
    alignItems: 'flex-end',
  },
  quantityLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  quantityValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary.main,
  },
  warehouseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  warehouseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginRight: 8,
  },
  warehouseName: {
    fontSize: 14,
    color: Colors.primary.main,
  },
  loadMoreButton: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    backgroundColor: Colors.background.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary.main,
  },
  loadMoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary.main,
  },
  bottomPadding: {
    height: 20,
  },
});

