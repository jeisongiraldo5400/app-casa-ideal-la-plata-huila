import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
    selectedPurchaseOrder,
    reset,
  } = useEntriesStore();

  const { user } = useAuth();
  const [registeredQuantities, setRegisteredQuantities] = useState<Map<string, number>>(new Map());
  const isFinalizingRef = useRef(false);

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
        .eq('purchase_order_id', purchaseOrderId)
        .is('deleted_at', null);

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
    // GUARD: Prevenir doble ejecución usando ref (inmune a race conditions de React)
    if (isFinalizingRef.current) {
      console.warn('[handleFinalize] Ya se está finalizando, ignorando tap duplicado');
      return;
    }
    isFinalizingRef.current = true;

    try {
      if (!user) {
        Alert.alert('Error', 'Usuario no autenticado');
        return;
      }

      const totalItems = entryItems.reduce((sum, item) => sum + item.quantity, 0);
      Alert.alert(
        'Confirmar entrada',
        `${selectedPurchaseOrder ? `OC #${selectedPurchaseOrder.order_number || selectedPurchaseOrder.id.slice(0, 8)}\n` : ''}` +
          `${entryItems.length} productos · ${totalItems} unidades`,
        [
          { text: 'Revisar', style: 'cancel' },
          {
            text: 'Registrar entrada',
            onPress: async () => {
              const { error } = await finalizeEntry(user.id);
              if (error) {
                Alert.alert('Error', error.message || 'Error al finalizar la entrada');
              } else {
                if (purchaseOrderId) await loadRegisteredQuantities();
                Alert.alert('Entrada registrada', 'El inventario y el progreso de la orden fueron actualizados correctamente.');
                reset();
              }
            },
          },
        ]
      );
    } finally {
      isFinalizingRef.current = false;
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
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${item.product.name}`}
                    onPress={() => Alert.alert(
                      'Quitar producto',
                      `¿Quitar ${item.product.name} de esta entrada?`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Quitar', style: 'destructive', onPress: () => removeProductFromEntry(index) },
                      ]
                    )}>
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.quantityRow}>
                  <Text style={styles.quantityLabel}>Cantidad:</Text>
                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      disabled={item.quantity <= 1}
                      accessibilityRole="button"
                      accessibilityLabel={`Disminuir cantidad de ${item.product.name}`}
                      onPress={() => updateProductQuantity(index, item.quantity - 1)}>
                      <Text style={styles.quantityButtonText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.quantityDisplay}>
                      <Text style={styles.quantityValue}>{item.quantity}</Text>
                      <Text style={styles.quantityUnit}>unidad{item.quantity !== 1 ? 'es' : ''}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Aumentar cantidad de ${item.product.name}`}
                      onPress={() => updateProductQuantity(index, item.quantity + 1)}>
                      <Text style={styles.quantityButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
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
          title={`Revisar entrada (${totalItems} unidades)`}
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
  quantityDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.background.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  quantityControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  quantityButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary.light + '35',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  quantityButtonText: {
    color: Colors.primary.main,
    fontSize: 20,
    fontWeight: '700',
  },
  quantityValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginRight: 4,
  },
  quantityUnit: {
    fontSize: 14,
    color: Colors.text.secondary,
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
