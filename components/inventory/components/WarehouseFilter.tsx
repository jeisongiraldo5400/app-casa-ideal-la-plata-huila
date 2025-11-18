import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { Colors } from '@/constants/theme';

export function WarehouseFilter() {
  const { warehouses, selectedWarehouseId, setSelectedWarehouse, loadInventory } = useInventory();

  const handleWarehouseChange = (warehouseId: string) => {
    if (warehouseId === 'all') {
      setSelectedWarehouse(null);
      loadInventory();
    } else {
      setSelectedWarehouse(warehouseId);
      loadInventory(warehouseId);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Filtrar por bodega:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedWarehouseId || 'all'}
          onValueChange={handleWarehouseChange}
          style={styles.picker}
          itemStyle={styles.pickerItem}>
          <Picker.Item label="Todas las bodegas" value="all" />
          {warehouses.map((warehouse) => (
            <Picker.Item
              key={warehouse.id}
              label={warehouse.name}
              value={warehouse.id}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  pickerContainer: {
    backgroundColor: Colors.background.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.divider,
    minHeight: 56,
    justifyContent: 'center',
  },
  picker: {
    height: 56,
    color: Colors.text.primary,
  },
  pickerItem: {
    fontSize: 16,
    color: Colors.text.primary,
  },
});


