import { MaterialIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { EntryOptionPickerFieldProps } from './entriesPickerFieldTypes';

export function EntryOptionPickerField({
  value,
  onValueChange,
  options,
  placeholder,
  modalTitle,
  colors,
}: EntryOptionPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const textPrimary = colors.text.primary;
  const paper = colors.background.paper;
  const divider = colors.divider;

  const displayLabel = useMemo(() => {
    if (!value) return placeholder;
    return options.find((o) => o.value === value)?.label ?? placeholder;
  }, [value, options, placeholder]);

  type Row = { kind: 'placeholder' } | { kind: 'opt'; value: string; label: string };

  const rows: Row[] = useMemo(
    () => [{ kind: 'placeholder' as const }, ...options.map((o) => ({ kind: 'opt' as const, value: o.value, label: o.label }))],
    [options]
  );

  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
        style={[styles.row, { backgroundColor: paper, borderColor: divider }]}>
        <Text style={[styles.rowText, { color: textPrimary }]} numberOfLines={2}>
          {displayLabel}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={22} color={textPrimary} />
      </TouchableOpacity>

      {open ? (
        <Modal
          visible
          animationType="fade"
          transparent
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
          onRequestClose={() => setOpen(false)}>
          <View style={styles.overlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} />
            <View style={[styles.sheet, { backgroundColor: paper, borderColor: divider }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>{modalTitle}</Text>
              <FlatList
                data={rows}
                keyExtractor={(item, index) => (item.kind === 'placeholder' ? 'ph' : item.value) + String(index)}
                renderItem={({ item }) => {
                  if (item.kind === 'placeholder') {
                    return (
                      <TouchableOpacity
                        style={[styles.option, { borderBottomColor: divider }]}
                        onPress={() => {
                          onValueChange('');
                          setOpen(false);
                        }}>
                        <Text style={[styles.optionText, { color: textPrimary }]}>{placeholder}</Text>
                        {value === '' && <MaterialIcons name="check" size={20} color={textPrimary} />}
                      </TouchableOpacity>
                    );
                  }
                  const selected = value === item.value;
                  return (
                    <TouchableOpacity
                      style={[styles.option, { borderBottomColor: divider }]}
                      onPress={() => {
                        onValueChange(item.value);
                        setOpen(false);
                      }}>
                      <Text style={[styles.optionText, { color: textPrimary }]}>{item.label}</Text>
                      {selected && <MaterialIcons name="check" size={20} color={textPrimary} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
});
