import { Picker } from '@react-native-picker/picker';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { EntryOptionPickerFieldProps } from './entriesPickerFieldTypes';

export function EntryOptionPickerField({
  value,
  onValueChange,
  options,
  placeholder,
  colors,
}: EntryOptionPickerFieldProps) {
  const textColor = colors.text.primary;
  return (
    <View style={[styles.pickerContainer, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <Picker
        selectedValue={value}
        onValueChange={onValueChange}
        style={[styles.picker, { color: textColor, fontWeight: '500' }]}
        dropdownIconColor={textColor}
        itemStyle={[styles.pickerItem, { color: textColor }]}>
        <Picker.Item label={placeholder} value="" color={textColor} />
        {options.map((opt) => (
          <Picker.Item key={opt.value} label={opt.label} value={opt.value} color={textColor} />
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
