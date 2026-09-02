import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlowStepper } from '@/components/inventory-flow';
import { DeliveryOrderSelector } from './DeliveryOrderSelector';
import { ExitModePickerField } from './ExitModePickerField';
import { ExitOrderSummary } from './ExitOrderSummary';
import { UserSelectField } from './UserSelectField';

const CUSTOMER_SEARCH_DEBOUNCE_MS = 800;
const CUSTOMER_SEARCH_MIN_LENGTH = 4;

export function SetupForm() {
  const {
    exitMode,
    selectedUserId,
    selectedCustomerId,
    selectedDeliveryOrderId,
    selectedDeliveryOrder,
    users,
    usersError,
    customers,
    loading,
    customersLoading,
    loadUsers,
    searchCustomers,
    setExitMode,
    setSelectedUser,
    setSelectedCustomer,
    reset,
    getSelectedDeliveryOrderProgress,
    canRegisterExit,
    authorizationMessage,
  } = useExitsStore(useShallow((state) => ({ exitMode: state.exitMode, selectedUserId: state.selectedUserId, selectedCustomerId: state.selectedCustomerId, selectedDeliveryOrderId: state.selectedDeliveryOrderId, selectedDeliveryOrder: state.selectedDeliveryOrder, users: state.users, usersError: state.usersError, customers: state.customers, loading: state.loading, customersLoading: state.customersLoading, loadUsers: state.loadUsers, searchCustomers: state.searchCustomers, setExitMode: state.setExitMode, setSelectedUser: state.setSelectedUser, setSelectedCustomer: state.setSelectedCustomer, reset: state.reset, getSelectedDeliveryOrderProgress: state.getSelectedDeliveryOrderProgress, canRegisterExit: state.canRegisterExit, authorizationMessage: state.authorizationMessage })));

  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const uiColorScheme = isDark ? 'dark' : 'light';
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const skipNextCustomerSearchRef = useRef(false);
  const lastSearchedTermRef = useRef('');
  const selectedCustomerNameRef = useRef('');

  const normalizedSearchInput = searchInput.trim();
  const isSearchPending = normalizedSearchInput !== debouncedSearchTerm;
  const hasCommittedSearch = debouncedSearchTerm.length >= CUSTOMER_SEARCH_MIN_LENGTH;
  // Empty-state only after the committed term matches what the user typed (no mid-typing flicker).
  const canShowEmptyState = hasCommittedSearch && !isSearchPending;

  const handleCustomerInputChange = useCallback((text: string) => {
    setSearchInput(text);

    // Si el usuario cambia manualmente el nombre, invalidar la selección previa
    if (!selectedCustomerId) {
      return;
    }

    const normalizedTyped = text.trim().toLowerCase();
    const normalizedSelectedName = selectedCustomerNameRef.current.trim().toLowerCase();
    if (normalizedTyped !== normalizedSelectedName) {
      selectedCustomerNameRef.current = '';
      setSelectedCustomer(null);
    }
  }, [selectedCustomerId, setSelectedCustomer]);

  const handleClearCustomerSearch = useCallback(() => {
    lastSearchedTermRef.current = '';
    selectedCustomerNameRef.current = '';
    skipNextCustomerSearchRef.current = false;
    setSelectedCustomer(null);
    setSearchInput('');
    setDebouncedSearchTerm('');
    searchCustomers('');
    Keyboard.dismiss();
  }, [searchCustomers, setSelectedCustomer]);

  // Limpiar solo el input local cuando el componente se desmonta
  // NO llamar reset() aquí porque se ejecuta al cambiar de step a 'scanning'
  // y eso limpia todo el estado, volviendo a 'setup'
  useEffect(() => {
    return () => {
      setSearchInput(''); // Solo limpiar el input local
    };
  }, []);

  // Una sola carga de usuarios por foco (también cubre el montaje inicial).
  useFocusEffect(
    useCallback(() => {
      void loadUsers();
    }, [loadUsers])
  );

  // Commit search term only after the user pauses typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchInput.trim());
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch customers from the committed (debounced) term only.
  useEffect(() => {
    if (skipNextCustomerSearchRef.current) {
      skipNextCustomerSearchRef.current = false;
      lastSearchedTermRef.current = debouncedSearchTerm;
      return;
    }

    if (debouncedSearchTerm.length >= CUSTOMER_SEARCH_MIN_LENGTH) {
      if (debouncedSearchTerm !== lastSearchedTermRef.current) {
        lastSearchedTermRef.current = debouncedSearchTerm;
        searchCustomers(debouncedSearchTerm);
      }
    } else if (debouncedSearchTerm.length === 0) {
      lastSearchedTermRef.current = '';
      searchCustomers('');
    }
  }, [debouncedSearchTerm, searchCustomers]);

  // Las remisiones las carga solo DeliveryOrderSelector (evita doble fetch y loading global duplicado)

  // Verificar si la orden está completa
  const deliveryOrderProgress = getSelectedDeliveryOrderProgress();
  const isOrderComplete = deliveryOrderProgress
    ? deliveryOrderProgress.items.every(item => item.isComplete)
    : false;
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const currentStep = !exitMode ? 1 : !selectedDeliveryOrderId ? 2 : 3;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: Colors.background.default }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <View style={styles.content}>
        <Card style={styles.card}>
          <Text style={[styles.title, { color: Colors.text.primary }]} accessibilityRole="header">Configurar salida</Text>
          <Text style={[styles.subtitle, { color: Colors.text.secondary }]}>
            Elige el destino, la orden y confirma antes de escanear.
          </Text>

          <FlowStepper labels={['Destino', 'Orden', 'Confirmar']} current={currentStep} />

          {/* Modo de Salida */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: Colors.text.primary }]}>Tipo de Salida *</Text>
            <ExitModePickerField
              exitMode={exitMode}
              onExitModeChange={setExitMode}
              colors={Colors}
              colorScheme={uiColorScheme}
            />
          </View>

          {/* Campo condicional: Usuario Interno */}
          {exitMode === 'direct_user' && (
            <View style={styles.formGroup}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.label, { color: Colors.text.primary }]}>Usuario Destinatario *</Text>
                <TouchableOpacity
                  onPress={() => loadUsers()}
                  style={styles.refreshButton}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Actualizar usuarios">
                  <MaterialIcons
                    name="refresh"
                    size={20}
                    color={loading ? Colors.text.secondary : Colors.primary.main}
                  />
                </TouchableOpacity>
              </View>
              {usersError ? (
                <View style={[styles.errorContainer, { backgroundColor: Colors.error.light + '20', borderColor: Colors.error.main }]} accessibilityLiveRegion="polite">
                  <Text style={[styles.errorText, { color: Colors.error.main }]}>{usersError}</Text>
                  <TouchableOpacity onPress={() => void loadUsers()} accessibilityRole="button" style={styles.retryInline}>
                    <MaterialIcons name="refresh" size={18} color={Colors.primary.main} />
                    <Text style={[styles.refreshText, { color: Colors.primary.main }]}>Reintentar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <UserSelectField
                users={users}
                selectedUserId={selectedUserId}
                onUserChange={setSelectedUser}
                colors={Colors}
                colorScheme={uiColorScheme}
              />
            </View>
          )}

          {/* Selector de remisión: solo mientras no haya una elegida (el selector trae su propio "Actualizar") */}
          {exitMode === 'direct_user' && selectedUserId && !selectedDeliveryOrderId && (
            <DeliveryOrderSelector />
          )}

          {/* Campo condicional: Cliente */}
          {exitMode === 'direct_customer' && (
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: Colors.text.primary }]}>Cliente *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.inputWithClearButton, {
                    backgroundColor: Colors.background.paper,
                    borderColor: Colors.divider,
                    color: Colors.text.primary
                  }]}
                  placeholder="Buscar por nombre o número de identificación"
                  placeholderTextColor={Colors.text.secondary}
                  value={searchInput}
                  onChangeText={handleCustomerInputChange}
                  editable={!loading}
                  accessibilityLabel="Buscar cliente"
                />
                {(searchInput.trim().length > 0 || selectedCustomerId) && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={handleClearCustomerSearch}
                    accessibilityRole="button"
                    accessibilityLabel="Limpiar búsqueda de cliente"
                  >
                    <MaterialIcons name="close" size={18} color={Colors.text.secondary} />
                  </TouchableOpacity>
                )}
              </View>

              {normalizedSearchInput.length > 0 && normalizedSearchInput.length < CUSTOMER_SEARCH_MIN_LENGTH && (
                <Text style={[styles.helperText, { color: Colors.text.secondary }]}>
                  Escriba al menos {CUSTOMER_SEARCH_MIN_LENGTH} caracteres para buscar.
                </Text>
              )}

              {selectedCustomer && (
                <View style={[styles.selectionSummary, { backgroundColor: Colors.primary.light + '20' }]}>
                  <MaterialIcons name="check-circle" size={18} color={Colors.primary.main} />
                  <Text style={[styles.selectionSummaryText, { color: Colors.text.primary }]}>
                    Cliente seleccionado: {selectedCustomer.name}
                  </Text>
                </View>
              )}

              {customersLoading && customers.length === 0 && hasCommittedSearch && (
                <View style={[styles.loadingContainer, { backgroundColor: Colors.background.default }]}>
                  <ActivityIndicator size="small" color={Colors.primary.main} />
                  <Text style={[styles.loadingText, { color: Colors.text.secondary }]}>Buscando clientes...</Text>
                </View>
              )}

              {hasCommittedSearch && customers.length > 0 && (
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
                        skipNextCustomerSearchRef.current = true;
                        selectedCustomerNameRef.current = customer.name;
                        setSearchInput(customer.name);
                        setDebouncedSearchTerm(customer.name.trim());
                        Keyboard.dismiss(); // Ocultar teclado al seleccionar cliente
                      }}>
                      <Text style={[styles.customerName, { color: Colors.text.primary }]}>{customer.name}</Text>
                      <Text style={[styles.customerIdNumber, { color: Colors.text.secondary }]}>ID: {customer.id_number}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!customersLoading && canShowEmptyState && customers.length === 0 && (
                <Text style={[styles.noResults, { color: Colors.text.secondary }]}>No se encontraron clientes</Text>
              )}
            </View>
          )}

          {/* Selector de orden de entrega para salida a cliente: solo mientras no haya una elegida */}
          {exitMode === 'direct_customer' && selectedCustomerId && !selectedDeliveryOrderId && (
            <DeliveryOrderSelector />
          )}

          {/* Paso 3: resumen de la orden elegida y arranque del escaneo (reemplaza la pantalla de confirmación) */}
          {selectedDeliveryOrderId && selectedDeliveryOrder ? <ExitOrderSummary /> : null}

          {selectedDeliveryOrderId && !canRegisterExit && (
            <View style={[styles.errorContainer, {
              backgroundColor: Colors.error.light + '20',
              borderColor: Colors.error.main
            }]}> 
              <Text style={[styles.errorText, { color: Colors.error.main }]}>
                {authorizationMessage || 'No estás autorizado para registrar la salida de inventario de esta orden.'}
              </Text>
            </View>
          )}

          <View style={styles.buttonsContainer}>
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
                // Solo pedir confirmación cuando hay algo que perder (destino u orden elegidos).
                if (selectedUserId || selectedCustomerId || selectedDeliveryOrderId) {
                  Alert.alert(
                    'Cancelar Configuración',
                    '¿Está seguro que desea cancelar? Se perderán todos los datos configurados.',
                    [
                      { text: 'No', style: 'cancel' },
                      { text: 'Sí, cancelar', style: 'destructive', onPress: () => reset() },
                    ]
                  );
                } else {
                  reset();
                }
              }}
              variant="outline"
              style={styles.cancelButton}
            />
          </View>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl },
  card: { marginBottom: Spacing.xl, padding: Spacing.lg },
  title: { ...Typography.section },
  subtitle: { ...Typography.bodySmall, marginBottom: Spacing.xxl, marginTop: Spacing.sm },
  formGroup: { marginBottom: Spacing.xl },
  helperText: { ...Typography.metadata, marginTop: Spacing.sm },
  selectionSummary: { alignItems: 'center', borderRadius: Radius.chip, flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, padding: Spacing.md },
  selectionSummaryText: { ...Typography.bodySmallStrong, flex: 1 },
  fieldHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  label: { ...Typography.bodySmallStrong, flex: 1 },
  refreshButton: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: Spacing.sm, width: 44 },
  refreshText: { ...Typography.bodySmallStrong },
  retryInline: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm, minHeight: 44 },
  input: { ...Typography.body, borderRadius: Radius.control, borderWidth: 1.5, minHeight: 52, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  inputContainer: { justifyContent: 'center', position: 'relative' },
  inputWithClearButton: { paddingRight: 48 },
  clearButton: { alignItems: 'center', borderRadius: Radius.pill, height: 44, justifyContent: 'center', position: 'absolute', right: Spacing.xs, width: 44 },
  loadingContainer: { alignItems: 'center', borderRadius: Radius.chip, flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md, padding: Spacing.md },
  loadingText: { ...Typography.bodySmall },
  customersList: { borderRadius: Radius.control, borderWidth: 1, marginTop: Spacing.sm, maxHeight: 250 },
  customerItem: { borderBottomWidth: 1, minHeight: 56, padding: Spacing.lg },
  customerName: { ...Typography.bodyStrong, marginBottom: Spacing.xs },
  customerIdNumber: { ...Typography.bodySmall },
  noResults: { ...Typography.bodySmall, fontStyle: 'italic', marginTop: Spacing.md, padding: Spacing.lg, textAlign: 'center' },
  errorContainer: { borderRadius: Radius.chip, borderWidth: 1, marginBottom: Spacing.lg, marginTop: Spacing.lg, padding: Spacing.md },
  errorText: { ...Typography.bodySmall },
  buttonsContainer: { gap: Spacing.md, marginTop: Spacing.sm },
  cancelButton: { marginTop: 0 },
  warningContainer: { alignItems: 'center', borderRadius: Radius.chip, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, padding: Spacing.md },
  warningText: { ...Typography.bodySmall, flex: 1 },
});
