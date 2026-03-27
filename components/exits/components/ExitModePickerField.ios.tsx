import type { ExitMode } from '@/components/exits/infrastructure/store/exitsStore';
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

import type { ExitModePickerFieldProps } from './pickerFieldTypes';

const OPTIONS: { value: ExitMode | null; label: string }[] = [
  { value: null, label: 'Seleccione el tipo de salida' },
  { value: 'direct_user', label: 'Remisión' },
  { value: 'direct_customer', label: 'Entrega a Cliente' },
];

function labelForMode(mode: ExitMode | null): string {
  return OPTIONS.find((o) => o.value === mode)?.label ?? OPTIONS[0].label;
}

export function ExitModePickerField({ exitMode, onExitModeChange, colors }: ExitModePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const displayLabel = useMemo(() => labelForMode(exitMode), [exitMode]);
  const textPrimary = colors.text.primary;
  const paper = colors.background.paper;
  const divider = colors.divider;

  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
        style={[styles.row, { backgroundColor: paper, borderColor: divider }]}>
        <Text style={[styles.rowText, { color: textPrimary }]} numberOfLines={1}>
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
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setOpen(false)}
            />
            <View style={[styles.sheet, { backgroundColor: paper, borderColor: divider }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>Tipo de salida</Text>
              <FlatList
                data={OPTIONS}
                keyExtractor={(item, index) => (item.value === null ? 'none' : item.value) + String(index)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.option, { borderBottomColor: divider }]}
                    onPress={() => {
                      onExitModeChange(item.value);
                      setOpen(false);
                    }}>
                    <Text style={[styles.optionText, { color: textPrimary }]}>{item.label}</Text>
                    {exitMode === item.value && (
                      <MaterialIcons name="check" size={20} color={textPrimary} />
                    )}
                  </TouchableOpacity>
                )}
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
    maxHeight: '55%',
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
