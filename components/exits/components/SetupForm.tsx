import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { Colors } from '@/constants/theme';
import { Picker } from '@react-native-picker/picker';

export function SetupForm() {
  const {
    warehouseId,
    warehouses,
    loadWarehouses,
    setWarehouse,
    startExit,
    error,
  } = useExitsStore();

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  const canStart = warehouseId !== null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.title}>Configuración de Salida</Text>
        <Text style={styles.subtitle}>
          Seleccione la bodega de la cual desea registrar la salida de productos
        </Text>

        <View style={styles.formGroup}>
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

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Button
          title="Iniciar Registro de Salida"
          onPress={startExit}
          disabled={!canStart}
          style={styles.startButton}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  card: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: Colors.divider,
    borderRadius: 12,
    backgroundColor: Colors.background.paper,
    overflow: 'hidden',
  },
  picker: {
    height: 52,
  },
  errorContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.error.light + '20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error.main,
  },
  errorText: {
    fontSize: 14,
    color: Colors.error.main,
    fontWeight: '500',
  },
  startButton: {
    marginTop: 8,
  },
});

