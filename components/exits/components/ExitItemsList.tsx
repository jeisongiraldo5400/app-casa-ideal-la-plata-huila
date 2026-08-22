import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { getColors, type ThemeColors } from '@/constants/theme';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function ExitItemsList() {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const {
    exitItems,
    removeProductFromExit,
    updateProductQuantity,
    finalizeExit,
    loading,
    canRegisterExit,
    authorizationMessage,
    selectedDeliveryOrder,
    exitMode,
    reset,
  } = useExitsStore();

  const { user } = useAuth();

  const handleFinalize = async () => {
    if (!user) {
      Alert.alert('Error', 'Usuario no autenticado');
      return;
    }

    if (!canRegisterExit) {
      Alert.alert(
        'Sin autorización',
        authorizationMessage || 'No estás autorizado para registrar la salida de inventario de esta orden.'
      );
      return;
    }

    const totalItems = exitItems.reduce((sum, item) => sum + item.quantity, 0);
    const recipient = exitMode === 'direct_customer'
      ? selectedDeliveryOrder?.customer_name || 'Cliente'
      : 'Usuario interno';

    Alert.alert(
      'Confirmar salida',
      `OE #${selectedDeliveryOrder?.order_number || selectedDeliveryOrder?.id.slice(0, 8) || '—'}\n` +
        `Destino: ${recipient}\n` +
        `${exitItems.length} productos · ${totalItems} unidades`,
      [
        { text: 'Revisar', style: 'cancel' },
        {
          text: 'Confirmar salida',
          onPress: async () => {
            try {
              const { error } = await finalizeExit(user.id);
              if (error) {
                const errorMessage = error?.message || error?.toString() || 'Error al finalizar la salida';
                Alert.alert('Error', errorMessage);
              } else {
                Alert.alert('Salida registrada', 'El inventario y el progreso de la orden fueron actualizados correctamente.');
                reset();
              }
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Error inesperado al finalizar la salida');
            }
          },
        },
      ]
    );
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

        <View style={styles.list}>
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
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${item.product.name}`}
                  onPress={() => Alert.alert(
                    'Quitar producto',
                    `¿Quitar ${item.product.name} de esta salida?`,
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Quitar', style: 'destructive', onPress: () => removeProductFromExit(index) },
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
                  <View style={styles.quantityDisplayContainer}>
                  <Text style={styles.quantityDisplayText}>{item.quantity}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.quantityButton}
                    disabled={!item.availableStock || item.availableStock <= 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Aumentar cantidad de ${item.product.name}`}
                    onPress={() => updateProductQuantity(index, item.quantity + 1)}>
                    <Text style={styles.quantityButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

        <Button
          title={`Revisar salida (${totalItems} unidades)`}
          onPress={handleFinalize}
          loading={loading}
          disabled={!canRegisterExit}
          style={styles.finalizeButton}
        />

        {!canRegisterExit && (
          <Text style={styles.unauthorizedText}>
            {authorizationMessage || 'No estás autorizado para registrar la salida de inventario de esta orden.'}
          </Text>
        )}
      </Card>
    </View>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
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
  list: {},
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
    backgroundColor: Colors.error.main + '24',
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
  quantityDisplayText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  finalizeButton: {
    marginTop: 16,
  },
  unauthorizedText: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.error.main,
    fontWeight: '500',
  },
});
