import { Spacing } from '@/constants/theme';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type OptionPickerThemeColors = {
  background: { paper: string };
  divider: string;
  text: { primary: string };
};

export type OptionPickerFieldProps = {
  /** '' = ninguno seleccionado */
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  modalTitle: string;
  colors: OptionPickerThemeColors;
  disabled?: boolean;
};

/**
 * Selector tipo bottom-sheet (Modal + FlatList) en vez de `@react-native-picker/picker`.
 * El Picker nativo se retiró de entries/exits/inventory por crashes al desmontar
 * su vista nativa (ver WarehousePickerField.tsx / EntryOptionPickerField.tsx);
 * este componente replica ese mismo patrón para el resto de la app.
 */
export function OptionPickerField({
  value,
  onValueChange,
  options,
  placeholder,
  modalTitle,
  colors,
  disabled = false,
}: OptionPickerFieldProps) {
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

  const insets = useSafeAreaInsets();
  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.row, { backgroundColor: paper, borderColor: divider, opacity: disabled ? 0.55 : 1 }]}>
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
            <View style={[styles.sheet, { backgroundColor: paper, borderColor: divider, paddingBottom: Math.max(insets.bottom, Spacing.xxl) }]}>
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
