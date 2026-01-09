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

  // Extraer nombres de bodegas desde stock_by_warehouse
  const getWarehouseNames = (stockByWarehouse: Record<string, { warehouse_id: string; warehouse_name: string; quantity: number }>): string => {
    // Filtrar solo bodegas con stock mayor a 0
    const warehouses = Object.values(stockByWarehouse).filter(w => (w.quantity || 0) > 0);
    
    if (warehouses.length === 0) {
      return 'Sin bodega';
    }
    
    if (warehouses.length === 1) {
      return warehouses[0].warehouse_name;
    }
    
    // Múltiples bodegas: mostrar nombres separados por comas
    return warehouses.map(w => w.warehouse_name).join(', ');
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {inventory.map((item) => {
        // Si hay bodega seleccionada, mostrar solo el stock de esa bodega
        const warehouseStock = selectedWarehouseId
          ? item.stock_by_warehouse[selectedWarehouseId]
          : null;

        const displayQuantity = warehouseStock?.quantity || item.total_stock;
        const displayWarehouse = selectedWarehouseId
          ? warehouseStock?.warehouse_name || 'Sin bodega'
          : getWarehouseNames(item.stock_by_warehouse);

        return (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={styles.itemInfo}>
                <Text style={styles.productName}>{item.name || 'Sin nombre'}</Text>
                <Text style={styles.productSku}>SKU: {item.sku || 'N/A'}</Text>
                <Text style={styles.productBarcode}>Código: {item.barcode || 'N/A'}</Text>
                <Text style={styles.productBrand}>Marca: {item.brand_name}</Text>
                <Text style={styles.productCategory}>Categoría: {item.category_name}</Text>
                {item.color_name && (
                  <Text style={styles.productColor}>Color: {item.color_name}</Text>
                )}
                <View style={styles.warehousesList}>
                  <Text style={styles.warehousesTitle}>Bodegas:</Text>
                  {Object.values(item.stock_by_warehouse)
                    .filter(w => (w.quantity || 0) > 0)
                    .map((warehouse) => (
                      <View key={warehouse.warehouse_id} style={styles.warehouseItem}>
                        <Text style={styles.warehouseItemName}>{warehouse.warehouse_name}:</Text>
                        <Text style={styles.warehouseItemQuantity}>
                          {warehouse.quantity} unidad{warehouse.quantity !== 1 ? 'es' : ''}
                        </Text>
                      </View>
                    ))}
                  {Object.values(item.stock_by_warehouse).filter(w => (w.quantity || 0) > 0).length === 0 && (
                    <Text style={styles.warehouseItemName}>Sin stock en bodegas</Text>
                  )}
                </View>
              </View>
              <View style={styles.quantityContainer}>
                <Text style={styles.quantityLabel}>Stock</Text>
                <Text style={styles.quantityValue}>{displayQuantity}</Text>
              </View>
            </View>
            {selectedWarehouseId && (
              <View style={styles.warehouseInfo}>
                <Text style={styles.warehouseLabel}>Bodega:</Text>
                <Text style={styles.warehouseName}>{displayWarehouse}</Text>
              </View>
            )}
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
    marginBottom: 2,
  },
  productColor: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  warehousesList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  warehousesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
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
    color: Colors.text.secondary,
    marginRight: 4,
  },
  warehouseItemQuantity: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.info.main,
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

