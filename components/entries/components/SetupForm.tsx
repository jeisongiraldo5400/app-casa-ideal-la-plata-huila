import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// UI
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Local
import { PurchaseOrderSelector } from './PurchaseOrderSelector';

// Components
import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';

export function SetupForm() {
  const {
    supplierId,
    purchaseOrderId,
    warehouseId,
    suppliers,
    purchaseOrders,
    warehouses,
    supplierSearchQuery,
    loading,
    setupStep,
    loadSuppliers,
    loadWarehouses,
    setSupplier,
    setPurchaseOrder,
    setWarehouse,
    setSetupStep,
    setSupplierSearchQuery,
    startEntry,
    entryType,
    setEntryType,
    purchaseOrderValidations,
  } = useEntriesStore();

  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');

  useEffect(() => {
    loadSuppliers();
    loadWarehouses();
  }, []);

  // Refrescar datos cuando la pantalla recibe foco
  useFocusEffect(
    useCallback(() => {
      loadSuppliers();
      loadWarehouses();
      // Refrescar órdenes de compra si hay un proveedor seleccionado
      if (supplierId) {
        setSupplier(supplierId);
      }
    }, [loadSuppliers, loadWarehouses, supplierId, setSupplier])
  );

  // Refrescar órdenes de compra cuando se vuelve al paso de purchase-order
  useEffect(() => {
    if (setupStep === 'purchase-order' && supplierId) {
      setSupplier(supplierId); // Esto dispara loadPurchaseOrders
    }
  }, [setupStep, supplierId, setSupplier]);

  // Filtrar proveedores por búsqueda (nombre o NIT)
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchQuery) return suppliers;
    const query = supplierSearchQuery.toLowerCase();
    return suppliers.filter(
      (supplier) =>
        supplier.name?.toLowerCase().includes(query) ||
        supplier.nit?.toLowerCase().includes(query)
    );
  }, [suppliers, supplierSearchQuery]);

  const renderFlowSelectionStep = () => (
    <View>
      <Text style={[styles.stepTitle, { color: Colors.text.primary }]}>¿Qué deseas registrar?</Text>
      <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
        Seleccione el tipo de entrada de inventario que va a realizar
      </Text>

      <Button
        title="Registrar entrada con Orden de Compra"
        onPress={() => setEntryType('PO_ENTRY')}
        style={styles.flowButton}
      />

      <Button
        title="Registrar entrada manual"
        onPress={() => setEntryType('ENTRY')}
        style={styles.flowButton}
        variant="secondary"
      />

      <Button
        title="Realizar carga inicial"
        onPress={() => setEntryType('INITIAL_LOAD')}
        style={styles.flowButton}
        variant="outline"
      />
    </View>
  );

  const renderSupplierStep = () => (
    <View>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setEntryType(null as any)} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary.main} />
        </TouchableOpacity>
        <View style={styles.stepHeaderText}>
          <Text style={[styles.stepTitle, { color: Colors.text.primary }]}>Paso 1: Seleccionar Proveedor</Text>
          <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
            {entryType === 'ENTRY' ? 'Seleccione el proveedor (Opcional)' : 'Busque y seleccione el proveedor por nombre o NIT'}
          </Text>
        </View>
      </View>

      <View style={[styles.searchContainer, {
        backgroundColor: Colors.background.paper,
        borderColor: Colors.divider
      }]}>
        <MaterialIcons name="search" size={20} color={Colors.text.secondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: Colors.text.primary }]}
          placeholder="Buscar por nombre o NIT..."
          placeholderTextColor={Colors.text.secondary}
          value={supplierSearchQuery}
          onChangeText={setSupplierSearchQuery}
        />
        {supplierSearchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSupplierSearchQuery('')} style={styles.clearButton}>
            <MaterialIcons name="clear" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.field}>
        <View style={styles.fieldHeader}>
          <Text style={[styles.label, { color: Colors.text.primary }]}>Proveedor {entryType === 'PO_ENTRY' ? '*' : '(Opcional)'}</Text>
          <TouchableOpacity
            onPress={() => loadSuppliers()}
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
            selectedValue={supplierId}
            onValueChange={(value) => setSupplier(value)}
            style={[styles.picker, { color: Colors.text.primary }]}
            dropdownIconColor={Colors.text.primary}
            itemStyle={[styles.pickerItem, { 
              color: Colors.text.primary 
            }]}>
            <Picker.Item label="Seleccione un proveedor" value={null} color={Colors.text.primary} />
            {filteredSuppliers.map((supplier) => (
              <Picker.Item
                key={supplier.id}
                label={`${supplier.name || 'Sin nombre'}${supplier.nit ? ` - NIT: ${supplier.nit}` : ''}`}
                value={supplier.id}
                color={Colors.text.primary}
              />
            ))}
          </Picker>
        </View>
      </View>

      {(supplierId || entryType === 'ENTRY') && (
        <View style={styles.supplierActions}>
          {entryType === 'PO_ENTRY' && (
            <Button
              title="Continuar con orden de compra"
              onPress={() => setSetupStep('purchase-order')}
              style={styles.continueButton}
            />
          )}

          {entryType === 'ENTRY' && (
            <Button
              title="Continuar a bodega"
              onPress={() => setSetupStep('warehouse')}
              style={styles.continueButton}
            />
          )}
        </View>
      )}
    </View>
  );

  const renderPurchaseOrderStep = () => (
    <View>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setSetupStep('supplier')} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary.main} />
        </TouchableOpacity>
        <View style={styles.stepHeaderText}>
          <Text style={[styles.stepTitle, { color: Colors.text.primary }]}>Paso 2: Seleccionar Orden de Compra (Opcional)</Text>
          <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
            Seleccione la orden de compra pendiente del proveedor o continúe sin orden
          </Text>
        </View>
      </View>

      {supplierId && (
        <View style={styles.refreshContainer}>
          <TouchableOpacity
            onPress={() => setSupplier(supplierId)}
            style={styles.refreshButtonInline}
            disabled={loading}>
            <MaterialIcons
              name="refresh"
              size={18}
              color={loading ? Colors.text.secondary : Colors.primary.main}
            />
            <Text style={[styles.refreshText, { color: loading ? Colors.text.secondary : Colors.primary.main }]}>
              Actualizar órdenes
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: Colors.background.default }]}>
          <ActivityIndicator size="large" color={Colors.primary.main} />
          <Text style={[styles.loadingText, { color: Colors.text.secondary }]}>Cargando órdenes de compra...</Text>
        </View>
      ) : (
        <PurchaseOrderSelector
          purchaseOrders={purchaseOrders}
          selectedPurchaseOrderId={purchaseOrderId}
          onSelect={setPurchaseOrder}
        />
      )}

      <View style={styles.purchaseOrderActions}>
        <Button
          title={purchaseOrderId ? "Continuar" : "Continuar sin orden"}
          onPress={() => setSetupStep('warehouse')}
          style={styles.continueButton}
        />
      </View>
    </View>
  );

  const renderWarehouseStep = () => {
    // Obtener la orden seleccionada para mostrar información
    const selectedOrder = purchaseOrders.find(order => order.id === purchaseOrderId);
    const orderItemsCount = selectedOrder?.items?.length || 0;
    const totalUnits = selectedOrder?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    return (
      <View>
        <View style={styles.stepHeader}>
          <TouchableOpacity
            onPress={() => {
              if (entryType === 'INITIAL_LOAD') {
                setEntryType(null as any); // Volver a selección de flujo
              } else if (entryType === 'ENTRY') {
                setSetupStep('supplier');
              } else {
                setSetupStep(purchaseOrderId ? 'purchase-order' : 'supplier');
              }
            }}
            style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.primary.main} />
          </TouchableOpacity>
          <View style={styles.stepHeaderText}>
            <Text style={[styles.stepTitle, { color: Colors.text.primary }]}>
              {entryType === 'INITIAL_LOAD' ? 'Paso 1' : 'Paso 3'}: Seleccionar Bodega
            </Text>
            <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
              Seleccione la bodega de destino para la entrada
            </Text>
          </View>
        </View>

        {/* Mostrar resumen de la orden seleccionada si existe */}
        {entryType === 'PO_ENTRY' && purchaseOrderId && selectedOrder && (
          <View style={[styles.orderSummary, { backgroundColor: Colors.primary.main + '10', borderColor: Colors.primary.main }]}>
            <MaterialIcons name="inventory-2" size={24} color={Colors.primary.main} />
            <View style={styles.orderSummaryText}>
              <Text style={[styles.orderSummaryTitle, { color: Colors.text.primary }]}>
                Orden #{selectedOrder.order_number || selectedOrder.id.slice(0, 8)}
              </Text>
              <Text style={[styles.orderSummarySubtitle, { color: Colors.text.secondary }]}>
                {orderItemsCount} producto{orderItemsCount !== 1 ? 's' : ''} • {totalUnits} unidad{totalUnits !== 1 ? 'es' : ''} total
              </Text>
            </View>
          </View>
        )}

        <View style={styles.field}>
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
              style={[styles.picker, { color: Colors.text.primary }]}
              dropdownIconColor={Colors.text.primary}
              itemStyle={[styles.pickerItem, {
                color: Colors.text.primary
              }]}>
              <Picker.Item label="Seleccione una bodega" value={null} color={Colors.text.primary} />
              {warehouses.map((warehouse) => (
                <Picker.Item
                  key={warehouse.id}
                  label={warehouse.name}
                  value={warehouse.id}
                  color={Colors.text.primary}
                />
              ))}
            </Picker>
          </View>
        </View>

        {/* Nota informativa para OC */}
        {entryType === 'PO_ENTRY' && purchaseOrderId && (
          <View style={[styles.infoNote, { backgroundColor: Colors.info?.light + '20' || Colors.primary.light + '20' }]}>
            <MaterialIcons name="info-outline" size={20} color={Colors.info?.main || Colors.primary.main} />
            <Text style={[styles.infoNoteText, { color: Colors.text.secondary }]}>
              Podrá escanear cualquier producto de la orden. El sistema validará automáticamente las cantidades.
            </Text>
          </View>
        )}

        {(() => {
          // Verificar si la orden está completa
          let isOrderComplete = false;
          if (entryType === 'PO_ENTRY' && purchaseOrderId) {
            const validation = purchaseOrderValidations[purchaseOrderId];
            isOrderComplete = validation?.isComplete || false;
          }

          // Simplificado: solo necesita bodega y que la orden no esté completa
          const canStart = warehouseId && !isOrderComplete;

          return (
            <Button
              title={isOrderComplete ? "Orden Completa - No se puede escanear" : "Comenzar Entrada"}
              onPress={startEntry}
              disabled={!canStart}
              style={styles.button}
            />
          );
        })()}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Text style={[styles.title, { color: Colors.text.primary }]}>Configurar Entrada</Text>
        <Text style={[styles.subtitle, { color: Colors.text.secondary }]}>
          Complete los pasos para configurar la entrada de productos
        </Text>

        {!entryType ? (
          renderFlowSelectionStep()
        ) : (
          <>
            {setupStep === 'supplier' && renderSupplierStep()}
            {entryType === 'PO_ENTRY' && setupStep === 'purchase-order' && renderPurchaseOrderStep()}
            {setupStep === 'warehouse' && renderWarehouseStep()}
          </>
        )}
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  stepHeaderText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    marginBottom: 20,
    minHeight: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  field: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
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
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 56,
    justifyContent: 'center',
  },
  picker: {
    height: 56,
  },
  pickerItem: {
    height: 56,
    fontSize: 16,
  },
  continueButton: {
    marginTop: 8,
  },
  skipButton: {
    marginTop: 8,
  },
  supplierActions: {
    marginTop: 8,
  },
  purchaseOrderActions: {
    marginTop: 16,
  },
  button: {
    marginTop: 8,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  flowButton: {
    marginBottom: 16,
  },
  orderSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
  },
  orderSummaryText: {
    flex: 1,
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  orderSummarySubtitle: {
    fontSize: 14,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    gap: 10,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});

