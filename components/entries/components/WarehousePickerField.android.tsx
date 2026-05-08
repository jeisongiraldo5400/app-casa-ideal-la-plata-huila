import { Picker } from '@react-native-picker/picker';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WarehousePickerFieldProps } from './entriesPickerFieldTypes';

export function WarehousePickerField({ warehouseId, warehouses, onWarehouseChange, colors }: WarehousePickerFieldProps) {
  const textColor = colors.text.primary;
  return (
    <View style={[styles.pickerContainer, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <Picker
        selectedValue={warehouseId}
        onValueChange={(value) => onWarehouseChange(value)}
        style={[styles.picker, { color: textColor, fontWeight: '500' }]}
        dropdownIconColor={textColor}
        itemStyle={[styles.pickerItem, { color: textColor }]}>
        <Picker.Item label="Seleccione una bodega" value={null} color={textColor} />
        {warehouses.map((warehouse) => (
          <Picker.Item
            key={warehouse.id}
            label={warehouse.name || 'Sin nombre'}
            value={warehouse.id}
            color={textColor}
          />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    height: 52,
  },
  pickerItem: {
    fontSize: 16,
  },
});
