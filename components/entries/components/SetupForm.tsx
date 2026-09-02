import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// UI
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';

// Local
import { PurchaseOrderSelector } from './PurchaseOrderSelector';
import { SupplierPickerField } from './SupplierPickerField';
import { WarehousePickerField } from './WarehousePickerField';

// Components
import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';

export function SetupForm() {
  const {
    supplierId,
    purchaseOrderId,
    selectedPurchaseOrder,
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
    openEntryConfirmation,
    entryType,
    setEntryType,
    purchaseOrderValidations,
  } = useEntriesStore();

  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const uiColorScheme = isDark ? 'dark' : 'light';
  const currentStep = !entryType ? 1 : setupStep === 'supplier' ? 1 : setupStep === 'purchase-order' ? 2 : 3;
  const stepLabels = entryType === 'PO_ENTRY'
    ? ['Proveedor', 'Orden', 'Bodega']
    : entryType === 'ENTRY'
      ? ['Proveedor', 'Bodega']
      : ['Bodega'];
  const dynamicStep = !entryType ? 1 : entryType === 'PO_ENTRY' ? currentStep : setupStep === 'warehouse' ? stepLabels.length : 1;

  useEffect(() => {
    loadSuppliers();
    loadWarehouses();
  }, [loadSuppliers, loadWarehouses]);

  useFocusEffect(
    useCallback(() => {
      loadSuppliers();
      loadWarehouses();
      if (supplierId) {
        setSupplier(supplierId);
      }
    }, [loadSuppliers, loadWarehouses, supplierId, setSupplier])
  );

  useEffect(() => {
    if (setupStep === 'purchase-order' && supplierId) {
      setSupplier(supplierId);
    }
  }, [setupStep, supplierId, setSupplier]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchQuery) return suppliers;
    const query = supplierSearchQuery.toLowerCase();
    return suppliers.filter(
      (supplier) =>
        supplier.name?.toLowerCase().includes(query) ||
        supplier.nit?.toLowerCase().includes(query)
    );
  }, [suppliers, supplierSearchQuery]);

  const handleContinueAsManualEntry = () => {
    setEntryType('ENTRY');
    setSetupStep('warehouse');
  };

  const renderFlowSelectionStep = () => (
    <View>
      <Text style={[styles.stepTitle, { color: Colors.text.primary }]}>¿Qué deseas registrar?</Text>
      <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
        Seleccione el tipo de entrada de inventario que va a realizar
      </Text>

      <View style={styles.flowCards}>
        <FlowCard icon="receipt-long" title="Con orden de compra" description="Recibe únicamente productos y cantidades pendientes de una OC." color={Colors.primary.main} secondaryColor={Colors.text.secondary} background={Colors.surface.muted} onPress={() => setEntryType('PO_ENTRY')} />
        <FlowCard icon="add-box" title="Entrada manual" description="Registra mercancía sin asociarla a una orden de compra." color={Colors.info.main} secondaryColor={Colors.text.secondary} background={Colors.background.default} onPress={() => setEntryType('ENTRY')} />
        <FlowCard icon="inventory" title="Carga inicial" description="Establece el inventario inicial de una bodega." color={Colors.success.main} secondaryColor={Colors.text.secondary} background={`${Colors.success.main}12`} onPress={() => setEntryType('INITIAL_LOAD')} />
      </View>
    </View>
  );

  const renderSupplierStep = () => (
    <View>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setEntryType(null)} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary.main} />
        </TouchableOpacity>
        <View style={styles.stepHeaderText}>
          <Text style={[styles.stepTitle, { color: Colors.text.primary }]}>Paso 1: Seleccionar proveedor</Text>
          <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
            {entryType === 'ENTRY'
              ? 'Seleccione el proveedor (opcional)'
              : 'Busque y seleccione el proveedor por nombre o NIT'}
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
          <Text style={[styles.label, { color: Colors.text.primary }]}>
            Proveedor {entryType === 'PO_ENTRY' ? '*' : '(opcional)'}
          </Text>
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
        <SupplierPickerField
          supplierId={supplierId}
          suppliers={filteredSuppliers}
          onSupplierChange={setSupplier}
          colors={Colors}
          colorScheme={uiColorScheme}
        />
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

  const canContinuePoToWarehouse =
    Boolean(purchaseOrderId && selectedPurchaseOrder && !loading);

  const renderPurchaseOrderStep = () => (
    <View>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setSetupStep('supplier')} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary.main} />
        </TouchableOpacity>
        <View style={styles.stepHeaderText}>
          <Text style={[styles.stepTitle, { color: Colors.text.primary }]}>Paso 2: Orden de compra</Text>
          <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
            Seleccione una orden pendiente del proveedor, o continúe como entrada manual sin OC.
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
          title="Continuar a bodega"
          onPress={() => setSetupStep('warehouse')}
          style={styles.continueButton}
          disabled={!canContinuePoToWarehouse}
        />
        <Button
          title="Continuar como entrada manual (sin OC)"
          onPress={handleContinueAsManualEntry}
          style={styles.skipButton}
          variant="outline"
        />
      </View>
    </View>
  );

  const renderWarehouseStep = () => {
    const selectedOrder = purchaseOrders.find(order => order.id === purchaseOrderId);
    const orderItemsCount = selectedOrder?.items?.length || 0;
    const totalUnits = selectedOrder?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const warehouseStepNumber = entryType === 'INITIAL_LOAD' ? 1 : entryType === 'ENTRY' ? 2 : 3;

    return (
      <View>
        <View style={styles.stepHeader}>
          <TouchableOpacity
            onPress={() => {
              if (entryType === 'INITIAL_LOAD') {
                setEntryType(null);
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
              Paso {warehouseStepNumber}: Seleccionar bodega
            </Text>
            <Text style={[styles.stepDescription, { color: Colors.text.secondary }]}>
              Seleccione la bodega de destino para la entrada
            </Text>
          </View>
        </View>

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
          <WarehousePickerField
            warehouseId={warehouseId}
            warehouses={warehouses}
            onWarehouseChange={setWarehouse}
            colors={Colors}
            colorScheme={uiColorScheme}
          />
        </View>

        {entryType === 'PO_ENTRY' && purchaseOrderId && (
          <View style={[styles.infoNote, { backgroundColor: Colors.info?.light + '20' || Colors.primary.light + '20' }]}>
            <MaterialIcons name="info-outline" size={20} color={Colors.info?.main || Colors.primary.main} />
            <Text style={[styles.infoNoteText, { color: Colors.text.secondary }]}>
              Podrá escanear cualquier producto de la orden. El sistema validará automáticamente las cantidades.
            </Text>
          </View>
        )}

        {(() => {
          let isOrderComplete = false;
          if (entryType === 'PO_ENTRY' && purchaseOrderId) {
            const validation = purchaseOrderValidations[purchaseOrderId];
            isOrderComplete = validation?.isComplete || false;
          }

          const canStart =
            warehouseId &&
            !isOrderComplete &&
            (entryType !== 'PO_ENTRY' || Boolean(purchaseOrderId));

          return (
            <Button
              title={isOrderComplete ? 'Orden completa — no se puede escanear' : 'Comenzar entrada'}
              onPress={openEntryConfirmation}
              disabled={!canStart}
              style={styles.button}
            />
          );
        })()}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Card style={styles.card}>
        <Text style={[styles.title, { color: Colors.text.primary }]}>Configurar entrada</Text>
        <Text style={[styles.subtitle, { color: Colors.text.secondary }]}>
          Complete los pasos para configurar la entrada de productos
        </Text>

        {entryType ? <View style={styles.stepper} accessibilityLabel={`Paso ${dynamicStep} de ${stepLabels.length}`}>
          {stepLabels.map((label, index) => {
            const stepNumber = index + 1;
            const active = stepNumber === dynamicStep;
            const complete = stepNumber < dynamicStep;
            return (
              <View key={label} style={styles.stepperItem}>
                <View
                  style={[styles.stepperDot, { backgroundColor: Colors.divider }, (active || complete) && { backgroundColor: Colors.primary.main }]}
                >
                  <Text
                    style={[styles.stepperNumber, { color: Colors.text.secondary }, (active || complete) && { color: Colors.primary.contrastText }]}
                  >
                    {complete ? '✓' : stepNumber}
                  </Text>
                </View>
                <Text style={[styles.stepperLabel, { color: active ? Colors.primary.main : Colors.text.secondary }]}>{label}</Text>
              </View>
            );
          })}
        </View> : null}

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
    </KeyboardAvoidingView>
  );
}

function FlowCard({ icon, title, description, color, secondaryColor, background, onPress }: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
  color: string;
  secondaryColor: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={[styles.flowCard, { backgroundColor: background, borderColor: `${color}45` }]}>
      <View style={[styles.flowIcon, { backgroundColor: `${color}18` }]}><MaterialIcons name={icon} size={25} color={color} /></View>
      <View style={styles.flowCopy}><Text style={[styles.flowTitle, { color }]}>{title}</Text><Text style={[styles.flowDescription, { color: secondaryColor }]}>{description}</Text></View>
      <MaterialIcons name="chevron-right" size={25} color={color} />
    </TouchableOpacity>
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
  stepper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  stepperItem: { alignItems: 'center', flex: 1 },
  stepperDot: { alignItems: 'center', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  stepperNumber: { fontSize: 13, fontWeight: '700' },
  stepperLabel: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  flowCards: { gap: 12 },
  flowCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', padding: 16 },
  flowIcon: { alignItems: 'center', borderRadius: 12, height: 48, justifyContent: 'center', width: 48 },
  flowCopy: { flex: 1, marginHorizontal: 12 },
  flowTitle: { fontSize: 16, fontWeight: '800' },
  flowDescription: { fontSize: 12, lineHeight: 17, marginTop: 3 },
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
