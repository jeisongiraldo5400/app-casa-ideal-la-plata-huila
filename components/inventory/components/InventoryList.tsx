import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Card } from '@/components/ui/Card';
import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { Colors } from '@/constants/theme';

export function InventoryList() {
  const { inventory, loading, searchQuery } = useInventory();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
        <Text style={styles.loadingText}>Cargando inventario...</Text>
      </View>
    );
  }

  // Filtrar inventario por búsqueda
  const filteredInventory = inventory.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.product?.name?.toLowerCase().includes(query) ||
      item.product?.sku?.toLowerCase().includes(query) ||
      item.product?.barcode?.toLowerCase().includes(query) ||
      item.warehouse?.name?.toLowerCase().includes(query)
    );
  });

  if (filteredInventory.length === 0) {
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
      {filteredInventory.map((item) => {
        // Validar que el item tenga los datos necesarios
        if (!item.product || !item.warehouse) {
          return null;
        }

        return (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={styles.itemInfo}>
                <Text style={styles.productName}>{item.product.name || 'Sin nombre'}</Text>
                <Text style={styles.productSku}>SKU: {item.product.sku || 'N/A'}</Text>
                <Text style={styles.productBarcode}>Código: {item.product.barcode || 'N/A'}</Text>
              </View>
              <View style={styles.quantityContainer}>
                <Text style={styles.quantityLabel}>Stock</Text>
                <Text style={styles.quantityValue}>{item.quantity || 0}</Text>
              </View>
            </View>
            <View style={styles.warehouseInfo}>
              <Text style={styles.warehouseLabel}>Bodega:</Text>
              <Text style={styles.warehouseName}>{item.warehouse.name || 'Sin bodega'}</Text>
            </View>
            {item.product.description && (
              <Text style={styles.description}>{item.product.description}</Text>
            )}
          </Card>
        );
      })}
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
  description: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

