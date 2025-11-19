import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export function EntryItemsList() {
  const {
    entryItems,
    removeProductFromEntry,
    updateProductQuantity,
    finalizeEntry,
    loading,
    purchaseOrderId,
  } = useEntriesStore();

  const { user } = useAuth();
  const [registeredQuantities, setRegisteredQuantities] = useState<Map<string, number>>(new Map());

  // Función para cargar las cantidades registradas desde inventory_entries
  const loadRegisteredQuantities = useCallback(async () => {
    if (!purchaseOrderId) {
      setRegisteredQuantities(new Map());
      return;
    }

    try {
      const { data: inventoryEntries, error: errorInventoryEntries } = await supabase
        .from('inventory_entries')
        .select('product_id, quantity')
        .eq('purchase_order_id', purchaseOrderId);

      if (errorInventoryEntries) {
        console.error('Error loading inventory entries:', errorInventoryEntries);
        setRegisteredQuantities(new Map());
        return;
      }

      // Agrupar por product_id y sumar las cantidades
      const quantitiesMap = new Map<string, number>();
      (inventoryEntries || []).forEach((entry: { product_id: string; quantity: number }) => {
        const currentQty = quantitiesMap.get(entry.product_id) || 0;
        quantitiesMap.set(entry.product_id, currentQty + entry.quantity);
      });

      setRegisteredQuantities(quantitiesMap);
    } catch (error) {
      console.error('Error loading registered quantities:', error);
      setRegisteredQuantities(new Map());
    }
  }, [purchaseOrderId]);

  // Cargar las cantidades registradas cuando cambie purchaseOrderId
  useEffect(() => {
    loadRegisteredQuantities();
  }, [loadRegisteredQuantities]);

  const handleFinalize = async () => {
    if (!user) {
      Alert.alert('Error', 'Usuario no autenticado');
      return;
    }

    const { error } = await finalizeEntry(user.id);
    if (error) {
      Alert.alert('Error', error.message || 'Error al finalizar la entrada');
    } else {
      // Recargar las cantidades registradas después de finalizar exitosamente
      if (purchaseOrderId) {
        await loadRegisteredQuantities();
      }
      Alert.alert('Éxito', 'Entrada registrada correctamente');
    }
  };

  const totalItems = entryItems.reduce((sum, item) => sum + item.quantity, 0);

  if (entryItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Productos Agregados</Text>
          <Text style={styles.subtitle}>{entryItems.length} producto(s) - {totalItems} unidad(es)</Text>
        </View>

        <ScrollView style={styles.list}>
          {entryItems.map((item, index) => {
            const registeredQty = registeredQuantities.get(item.product.id) || 0;
            const totalQty = registeredQty + item.quantity;

            return (
              <View key={index} style={styles.item}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.product.name}</Text>
                    <Text style={styles.itemSku}>SKU: {item.product.sku}</Text>
                    {purchaseOrderId && registeredQty > 0 && (
                      <Text style={styles.registeredQuantity}>
                        Registrado: {registeredQty} unidad{registeredQty !== 1 ? 'es' : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeProductFromEntry(index)}>
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

                {purchaseOrderId && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total registrado:</Text>
                    <Text style={styles.totalValue}>{totalQty} unidad{totalQty !== 1 ? 'es' : ''}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <Button
          title={`Finalizar Entrada (${totalItems} unidades)`}
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
  registeredQuantity: {
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary.main,
  },
  finalizeButton: {
    marginTop: 16,
  },
});

