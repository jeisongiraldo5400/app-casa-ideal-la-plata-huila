import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function ExitItemsList() {
  const {
    exitItems,
    removeProductFromExit,
    finalizeExit,
    loading,
  } = useExitsStore();

  const { user } = useAuth();

  const handleFinalize = async () => {
    if (!user) {
      Alert.alert('Error', 'Usuario no autenticado');
      return;
    }

    try {
      const { error } = await finalizeExit(user.id);
      if (error) {
        const errorMessage = error?.message || error?.toString() || 'Error al finalizar la salida';
        console.error('Error finalizing exit:', error);
        Alert.alert('Error', errorMessage);
      } else {
        Alert.alert('Éxito', 'Salida registrada correctamente');
      }
    } catch (error: any) {
      console.error('Exception finalizing exit:', error);
      Alert.alert('Error', error?.message || 'Error inesperado al finalizar la salida');
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
                <View style={styles.quantityDisplayContainer}>
                  <Text style={styles.quantityDisplayText}>{item.quantity}</Text>
                </View>
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
  quantityDisplayContainer: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    borderColor: Colors.divider,
    backgroundColor: Colors.background.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityDisplayText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  finalizeButton: {
    marginTop: 16,
  },
});

