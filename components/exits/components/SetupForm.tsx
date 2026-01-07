import { useExitsStore, type ExitMode } from '@/components/exits/infrastructure/store/exitsStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DeliveryOrderSelector } from './DeliveryOrderSelector';

export function SetupForm() {
  const {
    warehouseId,
    warehouses,
    exitMode,
    selectedUserId,
    selectedCustomerId,
    selectedDeliveryOrderId,
    deliveryObservations,
    users,
    customers,
    customerSearchTerm,
    loading,
    loadWarehouses,
    loadUsers,
    searchCustomers,
    searchDeliveryOrdersByUser,
    setWarehouse,
    setExitMode,
    setSelectedUser,
    setSelectedCustomer,
    setDeliveryObservations,
    startExit,
    reset,
    error,
    getSelectedDeliveryOrderProgress,
  } = useExitsStore();

  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    loadWarehouses();
    loadUsers();
  }, [loadWarehouses, loadUsers]);

  // Limpiar solo el input local cuando el componente se desmonta
  // NO llamar reset() aquí porque se ejecuta al cambiar de step a 'scanning'
  // y eso limpia todo el estado, volviendo a 'setup'
  useEffect(() => {
    return () => {
      setSearchInput(''); // Solo limpiar el input local
    };
  }, []);

  // Refrescar datos cuando la pantalla recibe foco (sin refrescar constantemente)
  useFocusEffect(
    useCallback(() => {
      // Solo refrescar cuando la pantalla recibe foco, no en cada cambio de estado
      loadWarehouses();
      loadUsers();
      // No refrescar remisiones aquí - ya hay un useEffect separado que lo maneja
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Sin dependencias para evitar refrescos constantes
  );

  // Debounce customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.length >= 4) {
        searchCustomers(searchInput);
      } else if (searchInput.length === 0) {
        // Limpiar resultados cuando el input está vacío
        searchCustomers('');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, searchCustomers]);

  // Ocultar teclado automáticamente cuando se encuentran clientes
  useEffect(() => {
    if (!loading && searchInput.length >= 4 && customers.length > 0) {
      // Ocultar teclado para que los resultados sean visibles
      Keyboard.dismiss();
    }
  }, [customers.length, loading, searchInput.length]);

  // Buscar remisiones cuando se selecciona un usuario
  useEffect(() => {
    if (exitMode === 'direct_user' && selectedUserId) {
      searchDeliveryOrdersByUser(selectedUserId);
    }
  }, [exitMode, selectedUserId, searchDeliveryOrdersByUser]);

  // Verificar si la orden está completa
  const deliveryOrderProgress = getSelectedDeliveryOrderProgress();
  const isOrderComplete = deliveryOrderProgress
    ? deliveryOrderProgress.items.every(item => item.isComplete)
    : false;

  const canStart =
    warehouseId !== null &&
    exitMode !== null &&
    (
      (exitMode === 'direct_user' && selectedUserId !== null && selectedDeliveryOrderId !== null && !isOrderComplete) ||
      (exitMode === 'direct_customer' && selectedCustomerId !== null && selectedDeliveryOrderId !== null && !isOrderComplete)
    );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: Colors.background.default }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <ScrollView
        style={[styles.container, { backgroundColor: Colors.background.default }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}>
        <Card style={styles.card}>
          <Text style={[styles.title, { 
            color: Colors.text.primary,
            fontWeight: '700'
          }]}>Configuración de Salida</Text>
          <Text style={[styles.subtitle, { 
            color: Colors.text.primary,
            opacity: 0.9
          }]}>
            Configure el tipo de salida y seleccione los datos requeridos
          </Text>

          {/* Modo de Salida */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: Colors.text.primary }]}>Tipo de Salida *</Text>
            <View style={[styles.pickerContainer, {
              backgroundColor: Colors.background.paper,
              borderColor: Colors.divider
            }]}>
              <Picker
                selectedValue={exitMode}
                onValueChange={(value) => setExitMode(value as ExitMode)}
                style={[styles.picker, { 
                  color: colorScheme === 'dark' ? Colors.text.primary : Colors.text.primary,
                  fontWeight: '500'
                }]}
                dropdownIconColor={Colors.text.primary}
                itemStyle={[styles.pickerItem, { 
                  color: colorScheme === 'dark' ? '#1f2937' : Colors.text.primary 
                }]}>
                <Picker.Item label="Seleccione el tipo de salida" value={null} color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
                <Picker.Item label="Remisión" value="direct_user" color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
                <Picker.Item label="Entrega a Cliente" value="direct_customer" color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
              </Picker>
            </View>
          </View>

          {/* Bodega */}
          <View style={styles.formGroup}>
            <View style={styles.fieldHeader}>
              <Text style={[styles.label, { color: Colors.text.primary }]}>Bodega *</Text>
              <TouchableOpacity
                onPress={() => loadWarehouses()}
                style={styles.refreshButton}
                disabled={loading}>
                <MaterialIcons
                  name="refresh"
                  size={20}
                  color={loading ? Colors.text.secondary : Colors.primary.main}
                />
              </TouchableOpacity>
            </View>
            <View style={[styles.pickerContainer, {
              backgroundColor: Colors.background.paper,
              borderColor: Colors.divider
            }]}>
              <Picker
                selectedValue={warehouseId}
                onValueChange={(value) => setWarehouse(value)}
                style={[styles.picker, { 
                  color: colorScheme === 'dark' ? Colors.text.primary : Colors.text.primary,
                  fontWeight: '500'
                }]}
                dropdownIconColor={Colors.text.primary}
                itemStyle={[styles.pickerItem, { 
                  color: colorScheme === 'dark' ? '#1f2937' : Colors.text.primary 
                }]}>
                <Picker.Item label="Seleccione una bodega" value={null} color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
                {warehouses.map((warehouse) => (
                  <Picker.Item
                    key={warehouse.id}
                    label={warehouse.name}
                    value={warehouse.id}
                    color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary}
                  />
                ))}
              </Picker>
            </View>
          </View>

          {/* Campo condicional: Usuario Interno */}
          {exitMode === 'direct_user' && (
            <View style={styles.formGroup}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.label, { color: Colors.text.primary }]}>Usuario Destinatario *</Text>
                <TouchableOpacity
                  onPress={() => loadUsers()}
                  style={styles.refreshButton}
                  disabled={loading}>
                  <MaterialIcons
                    name="refresh"
                    size={20}
                    color={loading ? Colors.text.secondary : Colors.primary.main}
                  />
                </TouchableOpacity>
              </View>
              <View style={[styles.pickerContainer, {
                backgroundColor: Colors.background.paper,
                borderColor: Colors.divider
              }]}>
                <Picker
                  selectedValue={selectedUserId}
                  onValueChange={(value) => setSelectedUser(value)}
                  style={[styles.picker, { 
                    color: colorScheme === 'dark' ? Colors.text.primary : Colors.text.primary,
                    fontWeight: '500'
                  }]}
                  dropdownIconColor={Colors.text.primary}
                  itemStyle={[styles.pickerItem, { 
                    color: colorScheme === 'dark' ? '#1f2937' : Colors.text.primary 
                  }]}>
                  <Picker.Item label="Seleccione un usuario" value={null} color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
                  {users.map((user) => (
                    <Picker.Item
                      key={user.id}
                      label={user.full_name || user.email || 'Usuario sin nombre'}
                      value={user.id}
                      color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          )}

          {/* Selector de Remisión (cuando se selecciona un usuario) */}
          {exitMode === 'direct_user' && selectedUserId && (
            <>
              <View style={styles.refreshContainer}>
                <TouchableOpacity
                  onPress={() => searchDeliveryOrdersByUser(selectedUserId)}
                  style={styles.refreshButtonInline}
                  disabled={loading}>
                  <MaterialIcons
                    name="refresh"
                    size={18}
                    color={loading ? Colors.text.secondary : Colors.primary.main}
                  />
                  <Text style={[styles.refreshText, { color: loading ? Colors.text.secondary : Colors.primary.main }]}>
                    Actualizar remisiones
                  </Text>
                </TouchableOpacity>
              </View>
              <DeliveryOrderSelector />
            </>
          )}

          {/* Campo condicional: Cliente */}
          {exitMode === 'direct_customer' && (
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: Colors.text.primary }]}>Cliente *</Text>
              <TextInput
                style={[styles.input, {
                  backgroundColor: Colors.background.paper,
                  borderColor: Colors.divider,
                  color: Colors.text.primary
                }]}
                placeholder="Buscar por nombre o número de identificación"
                placeholderTextColor={Colors.text.secondary}
                value={searchInput}
                onChangeText={setSearchInput}
              />

              {loading && (
                <View style={[styles.loadingContainer, { backgroundColor: Colors.background.default }]}>
                  <ActivityIndicator size="small" color={Colors.primary.main} />
                  <Text style={[styles.loadingText, { color: Colors.text.secondary }]}>Buscando clientes...</Text>
                </View>
              )}

              {!loading && searchInput.length >= 4 && customers.length > 0 && (
                <View style={[styles.customersList, {
                  backgroundColor: Colors.background.paper,
                  borderColor: Colors.divider
                }]}>
                  {customers.slice(0, 5).map((customer) => (
                    <TouchableOpacity
                      key={customer.id}
                      style={[
                        styles.customerItem,
                        { borderBottomColor: Colors.divider },
                        selectedCustomerId === customer.id && { backgroundColor: Colors.primary.light + '20' }
                      ]}
                      onPress={() => {
                        setSelectedCustomer(customer.id);
                        setSearchInput(customer.name);
                        Keyboard.dismiss(); // Ocultar teclado al seleccionar cliente
                      }}>
                      <Text style={[styles.customerName, { color: Colors.text.primary }]}>{customer.name}</Text>
                      <Text style={[styles.customerIdNumber, { color: Colors.text.secondary }]}>ID: {customer.id_number}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!loading && searchInput.length >= 4 && customers.length === 0 && (
                <Text style={[styles.noResults, { color: Colors.text.secondary }]}>No se encontraron clientes</Text>
              )}
            </View>
          )}

          {/* Selector de Orden de Entrega (opcional para Salida a Cliente) */}
          {exitMode === 'direct_customer' && selectedCustomerId && (
            <DeliveryOrderSelector />
          )}

          {/* Observaciones de entrega (opcional, cuando hay cliente/usuario y orden seleccionada) */}
          {((exitMode === 'direct_customer' && selectedCustomerId && selectedDeliveryOrderId) ||
            (exitMode === 'direct_user' && selectedUserId && selectedDeliveryOrderId)) && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: Colors.text.primary }]}>Observaciones de la entrega (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea, {
                    backgroundColor: Colors.background.paper,
                    borderColor: Colors.divider,
                    color: Colors.text.primary
                  }]}
                  placeholder="Ej: Recibe portería, cambio de destinatario, novedades en la entrega..."
                  placeholderTextColor={Colors.text.secondary}
                  value={deliveryObservations}
                  onChangeText={setDeliveryObservations}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}

          {error && (
            <View style={[styles.errorContainer, {
              backgroundColor: Colors.error.light + '20',
              borderColor: Colors.error.main
            }]}>
              <Text style={[styles.errorText, { color: Colors.error.main }]}>{error}</Text>
            </View>
          )}

          <View style={styles.buttonsContainer}>
            <Button
              title="Iniciar Registro de Salida"
              onPress={startExit}
              disabled={!canStart}
              style={styles.startButton}
            />
            {((exitMode === 'direct_customer' && selectedDeliveryOrderId) ||
              (exitMode === 'direct_user' && selectedDeliveryOrderId)) && isOrderComplete && (
                <View style={[styles.warningContainer, {
                  backgroundColor: Colors.success.light + '20',
                  borderColor: Colors.success.main + '40'
                }]}>
                  <MaterialIcons name="check-circle" size={20} color={Colors.success.main} />
                  <Text style={[styles.warningText, { color: Colors.success.main }]}>
                    Esta {exitMode === 'direct_user' ? 'remisión' : 'orden de entrega'} ya está completa. No se pueden registrar más productos.
                  </Text>
                </View>
              )}
            <Button
              title="Cancelar"
              onPress={() => {
                if (warehouseId || exitMode || selectedUserId || selectedCustomerId) {
                  Alert.alert(
                    'Cancelar Configuración',
                    '¿Está seguro que desea cancelar? Se perderán todos los datos configurados.',
                    [
                      {
                        text: 'No',
                        style: 'cancel',
                      },
                      {
                        text: 'Sí, cancelar',
                        style: 'destructive',
                        onPress: () => {
                          reset();
                          router.back();
                        },
                      },
                    ]
                  );
                } else {
                  reset();
                  router.back();
                }
              }}
              variant="outline"
              style={styles.cancelButton}
            />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  card: {
    marginBottom: 20,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  refreshButton: {
    padding: 4,
    marginLeft: 8,
  },
  refreshContainer: {
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  refreshButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  refreshText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    height: 52,
  },
  pickerItem: {
    fontSize: 16,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    height: 96,
    textAlignVertical: 'top',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
  },
  customersList: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    maxHeight: 250,
  },
  customerItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  customerIdNumber: {
    fontSize: 14,
  },
  noResults: {
    marginTop: 12,
    padding: 16,
    textAlign: 'center',
    fontSize: 14,
    fontStyle: 'italic',
  },
  errorContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  buttonsContainer: {
    marginTop: 8,
    gap: 12,
  },
  startButton: {
    marginTop: 0,
  },
  cancelButton: {
    marginTop: 0,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
});

