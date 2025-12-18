import { useExitsStore, type ExitMode } from '@/components/exits/infrastructure/store/exitsStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    loadWarehouses();
    loadUsers();
  }, [loadWarehouses, loadUsers]);

  // Debounce customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.length >= 2) {
        searchCustomers(searchInput);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, searchCustomers]);

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}>
      <Card style={styles.card}>
        <Text style={styles.title}>Configuración de Salida</Text>
        <Text style={styles.subtitle}>
          Configure el tipo de salida y seleccione los datos requeridos
        </Text>

        {/* Modo de Salida */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Tipo de Salida *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={exitMode}
              onValueChange={(value) => setExitMode(value as ExitMode)}
              style={styles.picker}>
              <Picker.Item label="Seleccione el tipo de salida" value={null} />
              <Picker.Item label="Remisión" value="direct_user" />
              <Picker.Item label="Entrega a Cliente" value="direct_customer" />
            </Picker>
          </View>
        </View>

        {/* Bodega */}
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

        {/* Campo condicional: Usuario Interno */}
        {exitMode === 'direct_user' && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Usuario Destinatario *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedUserId}
                onValueChange={(value) => setSelectedUser(value)}
                style={styles.picker}>
                <Picker.Item label="Seleccione un usuario" value={null} />
                {users.map((user) => (
                  <Picker.Item
                    key={user.id}
                    label={user.full_name || user.email || 'Usuario sin nombre'}
                    value={user.id}
                  />
                ))}
              </Picker>
            </View>
          </View>
        )}

        {/* Selector de Remisión (cuando se selecciona un usuario) */}
        {exitMode === 'direct_user' && selectedUserId && (
          <DeliveryOrderSelector />
        )}

        {/* Campo condicional: Cliente */}
        {exitMode === 'direct_customer' && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Cliente *</Text>
            <TextInput
              style={styles.input}
              placeholder="Buscar por nombre o número de identificación"
              value={searchInput}
              onChangeText={setSearchInput}
            />

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.primary.main} />
                <Text style={styles.loadingText}>Buscando clientes...</Text>
              </View>
            )}

            {!loading && searchInput.length >= 2 && customers.length > 0 && (
              <View style={styles.customersList}>
                {customers.slice(0, 5).map((customer) => (
                  <TouchableOpacity
                    key={customer.id}
                    style={[
                      styles.customerItem,
                      selectedCustomerId === customer.id && styles.customerItemSelected
                    ]}
                    onPress={() => {
                      setSelectedCustomer(customer.id);
                      setSearchInput(customer.name);
                    }}>
                    <Text style={styles.customerName}>{customer.name}</Text>
                    <Text style={styles.customerIdNumber}>ID: {customer.id_number}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!loading && searchInput.length >= 2 && customers.length === 0 && (
              <Text style={styles.noResults}>No se encontraron clientes</Text>
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
              <Text style={styles.label}>Observaciones de la entrega (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Ej: Recibe portería, cambio de destinatario, novedades en la entrega..."
                value={deliveryObservations}
                onChangeText={setDeliveryObservations}
                multiline
                numberOfLines={3}
              />
            </View>
          )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
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
              <View style={styles.warningContainer}>
                <MaterialIcons name="check-circle" size={20} color={Colors.success.main} />
                <Text style={styles.warningText}>
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
  input: {
    borderWidth: 1.5,
    borderColor: Colors.divider,
    borderRadius: 12,
    backgroundColor: Colors.background.paper,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text.primary,
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
    backgroundColor: Colors.background.default,
    borderRadius: 8,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: Colors.text.secondary,
  },
  customersList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 12,
    backgroundColor: Colors.background.paper,
    maxHeight: 250,
  },
  customerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  customerItemSelected: {
    backgroundColor: Colors.primary.light + '20',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  customerIdNumber: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  noResults: {
    marginTop: 12,
    padding: 16,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.text.secondary,
    fontStyle: 'italic',
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
    backgroundColor: Colors.success.light + '20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.success.main + '40',
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: Colors.success.main,
    fontWeight: '500',
  },
});

