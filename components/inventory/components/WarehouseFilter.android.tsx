import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { useTheme } from '@/components/theme';
import { Radius, Spacing, getColors } from '@/constants/theme';
import { Picker } from '@react-native-picker/picker';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const ALL_WAREHOUSES_VALUE = '__all__';

export function WarehouseFilter() {
  const { warehouses, selectedWarehouseId, setSelectedWarehouse } = useInventory();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);

  const handleWarehouseChange = (value: string) => {
    setSelectedWarehouse(value === ALL_WAREHOUSES_VALUE ? null : value);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: Colors.text.primary }]}>Filtrar por bodega:</Text>

      <View
        style={[
          styles.pickerContainer,
          {
            backgroundColor: Colors.background.paper,
            borderColor: Colors.divider,
          },
        ]}>
        <Picker
          selectedValue={selectedWarehouseId || ALL_WAREHOUSES_VALUE}
          onValueChange={(value) => handleWarehouseChange(value as string)}
          style={[styles.picker, { color: Colors.text.primary }]}
          dropdownIconColor={Colors.text.primary}>
          <Picker.Item label="Todas las bodegas" value={ALL_WAREHOUSES_VALUE} color={Colors.text.primary} />
          {warehouses.map((warehouse) => (
            <Picker.Item
              key={warehouse.id}
              label={warehouse.name || 'Sin nombre'}
              value={warehouse.id}
              color={Colors.text.primary}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  pickerContainer: {
    borderRadius: Radius.control,
    borderWidth: 1,
    minHeight: 56,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  picker: {
    height: 56,
  },
});
