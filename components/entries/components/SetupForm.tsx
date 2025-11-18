import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Colors } from '@/constants/theme';

export function SetupForm() {
  const {
    supplierId,
    warehouseId,
    suppliers,
    warehouses,
    loadSuppliers,
    loadWarehouses,
    setSupplier,
    setWarehouse,
    startEntry,
  } = useEntriesStore();

  useEffect(() => {
    loadSuppliers();
    loadWarehouses();
  }, []);

  const canStart = supplierId && warehouseId;

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>Configurar Entrada</Text>
        <Text style={styles.subtitle}>
          Seleccione el proveedor y la bodega de destino antes de comenzar
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Proveedor *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={supplierId}
              onValueChange={(value) => setSupplier(value)}
              style={styles.picker}>
              <Picker.Item label="Seleccione un proveedor" value={null} />
              {suppliers.map((supplier) => (
                <Picker.Item
                  key={supplier.id}
                  label={supplier.name || 'Sin nombre'}
                  value={supplier.id}
                />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Bodega *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={warehouseId}
              onValueChange={(value) => setWarehouse(value)}
              style={styles.picker}>
              <Picker.Item label="Seleccione una bodega" value={null} />
              {warehouses.map((warehouse) => (
                <Picker.Item
                  key={warehouse.id}
                  label={warehouse.name}
                  value={warehouse.id}
                />
              ))}
            </Picker>
          </View>
        </View>

        <Button
          title="Comenzar Entrada"
          onPress={startEntry}
          disabled={!canStart}
          style={styles.button}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    margin: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: Colors.divider,
    borderRadius: 8,
    backgroundColor: Colors.background.paper,
    overflow: 'hidden',
  },
  picker: {
    height: 48,
  },
  button: {
    marginTop: 8,
  },
});

