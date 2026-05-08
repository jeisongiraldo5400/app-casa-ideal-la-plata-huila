import type { ExitMode } from '@/components/exits/infrastructure/store/exitsStore';
import { Picker } from '@react-native-picker/picker';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ExitModePickerFieldProps } from './pickerFieldTypes';

export function ExitModePickerField({ exitMode, onExitModeChange, colors }: ExitModePickerFieldProps) {
  const textColor = colors.text.primary;
  return (
    <View style={[styles.pickerContainer, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <Picker
        selectedValue={exitMode}
        onValueChange={(value) => onExitModeChange(value as ExitMode | null)}
        style={[styles.picker, { color: textColor, fontWeight: '500' }]}
        dropdownIconColor={textColor}
        itemStyle={[styles.pickerItem, { color: textColor }]}>
        <Picker.Item label="Seleccione el tipo de salida" value={null} color={textColor} />
        <Picker.Item label="Remisión" value="direct_user" color={textColor} />
        <Picker.Item label="Entrega a Cliente" value="direct_customer" color={textColor} />
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
