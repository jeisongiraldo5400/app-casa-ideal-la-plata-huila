import { Picker } from '@react-native-picker/picker';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { UserSelectFieldProps } from './pickerFieldTypes';

export function UserSelectField({ users, selectedUserId, onUserChange, colors }: UserSelectFieldProps) {
  const textColor = colors.text.primary;
  return (
    <View style={[styles.pickerContainer, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <Picker
        selectedValue={selectedUserId}
        onValueChange={(value) => onUserChange(value)}
        style={[styles.picker, { color: textColor, fontWeight: '500' }]}
        dropdownIconColor={textColor}
        itemStyle={[styles.pickerItem, { color: textColor }]}>
        <Picker.Item label="Seleccione un usuario" value={null} color={textColor} />
        {users.map((user) => (
          <Picker.Item
            key={user.id}
            label={user.full_name || user.email || 'Usuario sin nombre'}
            value={user.id}
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
