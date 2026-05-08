import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { getColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const ALL_WAREHOUSES_VALUE = '__all__';

type Row =
  | { kind: 'all'; id: typeof ALL_WAREHOUSES_VALUE; label: string }
  | { kind: 'warehouse'; id: string; label: string };

export function WarehouseFilter() {
  const { warehouses, selectedWarehouseId, setSelectedWarehouse } = useInventory();
  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');
  const [open, setOpen] = React.useState(false);

  const selectedLabel = React.useMemo(() => {
    if (!selectedWarehouseId) return 'Todas las bodegas';
    const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);
    return selectedWarehouse?.name || 'Todas las bodegas';
  }, [selectedWarehouseId, warehouses]);

  const rows = React.useMemo<Row[]>(
    () => [
      { kind: 'all', id: ALL_WAREHOUSES_VALUE, label: 'Todas las bodegas' },
      ...warehouses.map((warehouse) => ({
        kind: 'warehouse' as const,
        id: warehouse.id,
        label: warehouse.name || 'Sin nombre',
      })),
    ],
    [warehouses]
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: Colors.text.primary }]}>Filtrar por bodega:</Text>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
        style={[
          styles.row,
          {
            backgroundColor: Colors.background.paper,
            borderColor: Colors.divider,
          },
        ]}>
        <Text style={[styles.rowText, { color: Colors.text.primary }]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.text.primary} />
      </TouchableOpacity>

      {open ? (
        <Modal
          visible
          animationType="fade"
          transparent
          presentationStyle="overFullScreen"
          onRequestClose={() => setOpen(false)}>
          <View style={styles.overlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} />

            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: Colors.background.paper,
                  borderColor: Colors.divider,
                },
              ]}>
              <Text style={[styles.sheetTitle, { color: Colors.text.primary }]}>Bodega</Text>

              <FlatList
                data={rows}
                keyExtractor={(item) => (item.kind === 'all' ? ALL_WAREHOUSES_VALUE : item.id)}
                renderItem={({ item }) => {
                  const selected =
                    (item.kind === 'all' && selectedWarehouseId === null) ||
                    (item.kind === 'warehouse' && selectedWarehouseId === item.id);

                  return (
                    <TouchableOpacity
                      style={[styles.option, { borderBottomColor: Colors.divider }]}
                      onPress={() => {
                        setSelectedWarehouse(item.kind === 'all' ? null : item.id);
                        setOpen(false);
                      }}>
                      <Text style={[styles.optionText, { color: Colors.text.primary }]}>{item.label}</Text>
                      {selected && <MaterialIcons name="check" size={20} color={Colors.text.primary} />}
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
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: {
    flex: 1,
    fontSize: 16,
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
    maxHeight: '60%',
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
