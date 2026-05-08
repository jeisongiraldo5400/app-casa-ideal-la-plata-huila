import { Picker } from '@react-native-picker/picker';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { SupplierPickerFieldProps } from './entriesPickerFieldTypes';

function supplierLabel(s: SupplierPickerFieldProps['suppliers'][0]): string {
  return `${s.name || 'Sin nombre'}${s.nit ? ` - NIT: ${s.nit}` : ''}`;
}

export function SupplierPickerField({ supplierId, suppliers, onSupplierChange, colors }: SupplierPickerFieldProps) {
  const textColor = colors.text.primary;
  return (
    <View style={[styles.pickerContainer, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <Picker
        selectedValue={supplierId}
        onValueChange={(value) => onSupplierChange(value)}
        style={[styles.picker, { color: textColor, fontWeight: '500' }]}
        dropdownIconColor={textColor}
        itemStyle={[styles.pickerItem, { color: textColor }]}>
        <Picker.Item label="Seleccione un proveedor" value={null} color={textColor} />
        {suppliers.map((supplier) => (
          <Picker.Item key={supplier.id} label={supplierLabel(supplier)} value={supplier.id} color={textColor} />
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
