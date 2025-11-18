import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Colors } from '@/constants/theme';
import { PurchaseOrderSelector } from './PurchaseOrderSelector';

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
  } = useEntriesStore();

  useEffect(() => {
    loadSuppliers();
    loadWarehouses();
  }, []);

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

  const canStart = supplierId && warehouseId; // Orden de compra es opcional

  const renderSupplierStep = () => (
    <View>
      <Text style={styles.stepTitle}>Paso 1: Seleccionar Proveedor</Text>
      <Text style={styles.stepDescription}>
        Busque y seleccione el proveedor por nombre o NIT
      </Text>

      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={Colors.text.secondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
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
        <Text style={styles.label}>Proveedor *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={supplierId}
            onValueChange={(value) => setSupplier(value)}
            style={styles.picker}
            itemStyle={styles.pickerItem}>
            <Picker.Item label="Seleccione un proveedor" value={null} />
            {filteredSuppliers.map((supplier) => (
              <Picker.Item
                key={supplier.id}
                label={`${supplier.name || 'Sin nombre'}${supplier.nit ? ` - NIT: ${supplier.nit}` : ''}`}
                value={supplier.id}
              />
            ))}
          </Picker>
        </View>
      </View>

      {supplierId && (
        <View style={styles.supplierActions}>
          <Button
            title="Continuar con orden de compra"
            onPress={() => setSetupStep('purchase-order')}
            style={styles.continueButton}
          />
          <Button
            title="Omitir orden de compra"
            onPress={() => setSetupStep('warehouse')}
            variant="outline"
            style={styles.skipButton}
          />
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
          <Text style={styles.stepTitle}>Paso 2: Seleccionar Orden de Compra (Opcional)</Text>
          <Text style={styles.stepDescription}>
            Seleccione la orden de compra pendiente del proveedor o continúe sin orden
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary.main} />
          <Text style={styles.loadingText}>Cargando órdenes de compra...</Text>
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

  const renderWarehouseStep = () => (
    <View>
      <View style={styles.stepHeader}>
        <TouchableOpacity 
          onPress={() => setSetupStep(purchaseOrderId ? 'purchase-order' : 'supplier')} 
          style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary.main} />
        </TouchableOpacity>
        <View style={styles.stepHeaderText}>
          <Text style={styles.stepTitle}>Paso 3: Seleccionar Bodega</Text>
          <Text style={styles.stepDescription}>
            Seleccione la bodega de destino para la entrada
          </Text>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Bodega *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={warehouseId}
            onValueChange={(value) => setWarehouse(value)}
            style={styles.picker}
            itemStyle={styles.pickerItem}>
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

      <Button
        title="Comenzar Entrada"
        onPress={startEntry}
        disabled={!canStart}
        style={styles.button}
      />
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>Configurar Entrada</Text>
        <Text style={styles.subtitle}>
          Complete los pasos para configurar la entrada de productos
        </Text>

        {setupStep === 'supplier' && renderSupplierStep()}
        {setupStep === 'purchase-order' && renderPurchaseOrderStep()}
        {setupStep === 'warehouse' && renderWarehouseStep()}
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
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
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
    color: Colors.text.primary,
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.paper,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.divider,
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
    color: Colors.text.primary,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: Colors.divider,
    borderRadius: 8,
    backgroundColor: Colors.background.paper,
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
    color: Colors.text.primary,
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
    color: Colors.text.secondary,
  },
});

