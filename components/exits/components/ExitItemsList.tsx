import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors } from '@/constants/theme';

export function ExitItemsList() {
  const {
    exitItems,
    removeProductFromExit,
    updateProductQuantity,
    finalizeExit,
    loading,
  } = useExitsStore();

  const { user } = useAuth();

  const handleFinalize = async () => {
    if (!user) {
      Alert.alert('Error', 'Usuario no autenticado');
      return;
    }

    const { error } = await finalizeExit(user.id);
    if (error) {
      Alert.alert('Error', error.message || 'Error al finalizar la salida');
    } else {
      Alert.alert('Éxito', 'Salida registrada correctamente');
    }
  };


  const totalItems = exitItems.reduce((sum, item) => sum + item.quantity, 0);

  if (exitItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Productos a Salir</Text>
          <Text style={styles.subtitle}>{exitItems.length} producto(s) - {totalItems} unidad(es)</Text>
        </View>

        <ScrollView style={styles.list}>
          {exitItems.map((item, index) => (
            <View key={index} style={styles.item}>
              <View style={styles.itemHeader}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.product.name}</Text>
                  <Text style={styles.itemSku}>SKU: {item.product.sku}</Text>
                  <Text style={styles.stockInfo}>
                    Stock disponible: {item.availableStock || 0} unidad{item.availableStock !== 1 ? 'es' : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeProductFromExit(index)}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.quantityRow}>
                <Text style={styles.quantityLabel}>Cantidad:</Text>
                <Input
                  value={item.quantity.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text, 10);
                    if (!isNaN(num) && num > 0) {
                      updateProductQuantity(index, num);
                    } else if (text === '') {
                      updateProductQuantity(index, 1);
                    }
                  }}
                  keyboardType="numeric"
                  style={styles.quantityInput}
                  containerStyle={styles.quantityInputContainer}
                />
              </View>
            </View>
          ))}
        </ScrollView>

        <Button
          title={`Finalizar Salida (${totalItems} unidades)`}
          onPress={handleFinalize}
          loading={loading}
          style={styles.finalizeButton}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  list: {
    maxHeight: 300,
  },
  item: {
    padding: 12,
    backgroundColor: Colors.background.default,
    borderRadius: 8,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  itemSku: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  stockInfo: {
    fontSize: 12,
    color: Colors.info.main,
    marginTop: 4,
    fontWeight: '500',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.error.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: Colors.error.main,
    fontSize: 18,
    fontWeight: '600',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.secondary,
    marginRight: 12,
    minWidth: 80,
  },
  quantityInputContainer: {
    flex: 1,
    marginBottom: 0,
  },
  quantityInput: {
    textAlign: 'center',
  },
  finalizeButton: {
    marginTop: 16,
  },
});

