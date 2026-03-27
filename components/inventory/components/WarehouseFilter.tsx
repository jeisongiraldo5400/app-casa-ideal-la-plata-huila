import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { getColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Picker } from '@react-native-picker/picker';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function WarehouseFilter() {
  const { warehouses, selectedWarehouseId, setSelectedWarehouse, loadInventory } = useInventory();
  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');

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
      <Text style={[styles.label, { color: Colors.text.primary }]}>Filtrar por bodega:</Text>
      <View style={[styles.pickerContainer, { 
        backgroundColor: Colors.background.paper,
        borderColor: Colors.divider
      }]}>
        <Picker
          selectedValue={selectedWarehouseId || 'all'}
          onValueChange={handleWarehouseChange}
          style={[styles.picker, { color: Colors.text.primary }]}
          dropdownIconColor={Colors.text.primary}
          itemStyle={[styles.pickerItem, { 
            color: colorScheme === 'dark' ? '#1f2937' : Colors.text.primary 
          }]}>
          <Picker.Item label="Todas las bodegas" value="all" color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
          {warehouses.map((warehouse) => (
            <Picker.Item
              key={warehouse.id}
              label={warehouse.name}
              value={warehouse.id}
              color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary}
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
    marginBottom: 8,
  },
  pickerContainer: {
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 56,
    justifyContent: 'center',
  },
  picker: {
    height: 56,
  },
  pickerItem: {
    fontSize: 16,
  },
});


