import { useFocusEffect } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';
import React, { useCallback, useEffect, useMemo } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// UI
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { useTheme } from '@/components/theme';

// Local
import { FlowStepper } from '@/components/inventory-flow';
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
    catalogError,
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
  } = useEntriesStore(useShallow((state) => ({ supplierId: state.supplierId, purchaseOrderId: state.purchaseOrderId, selectedPurchaseOrder: state.selectedPurchaseOrder, warehouseId: state.warehouseId, suppliers: state.suppliers, purchaseOrders: state.purchaseOrders, warehouses: state.warehouses, supplierSearchQuery: state.supplierSearchQuery, loading: state.loading, catalogError: state.catalogError, setupStep: state.setupStep, loadSuppliers: state.loadSuppliers, loadWarehouses: state.loadWarehouses, setSupplier: state.setSupplier, setPurchaseOrder: state.setPurchaseOrder, setWarehouse: state.setWarehouse, setSetupStep: state.setSetupStep, setSupplierSearchQuery: state.setSupplierSearchQuery, startEntry: state.startEntry, entryType: state.entryType, setEntryType: state.setEntryType, purchaseOrderValidations: state.purchaseOrderValidations })));

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

  // Una sola carga de catálogos por foco (cubre también el montaje inicial).
  useFocusEffect(
    useCallback(() => {
      void loadSuppliers();
      void loadWarehouses();
    }, [loadSuppliers, loadWarehouses])
  );

  // Las órdenes del proveedor se cargan al entrar al paso de orden de compra.
  useEffect(() => {
    if (setupStep === 'purchase-order' && supplierId) {
      setSupplier(supplierId);
    }
  }, [setupStep, supplierId, setSupplier]);

  const retryCatalogs = useCallback(() => {
    void loadSuppliers();
    void loadWarehouses();
    if (setupStep === 'purchase-order' && supplierId) {
      setSupplier(supplierId);
    }
  }, [loadSuppliers, loadWarehouses, setSupplier, setupStep, supplierId]);

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
        <TouchableOpacity onPress={() => setEntryType(null)} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver a elegir el tipo de entrada">
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
          <TouchableOpacity onPress={() => setSupplierSearchQuery('')} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda">
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
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Actualizar proveedores">
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
        <TouchableOpacity onPress={() => setSetupStep('supplier')} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver al proveedor">
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
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Actualizar órdenes de compra">
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
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Volver al paso anterior">
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
          <View style={[styles.orderSummary, { backgroundColor: `${Colors.primary.main}10`, borderColor: Colors.primary.main }]}>
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
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Actualizar bodegas">
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
          <View style={[styles.infoNote, { backgroundColor: `${Colors.info.main}14` }]}>
            <MaterialIcons name="info-outline" size={20} color={Colors.info.main} />
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
          const supplierName = suppliers.find((supplier) => supplier.id === supplierId)?.name || null;
          const warehouseLabel = warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || null;

          return (
            <>
              {warehouseId ? (
                <View style={[styles.summaryCard, { backgroundColor: Colors.background.paper, borderColor: Colors.divider }]} accessibilityLabel="Resumen de la entrada">
                  <Text style={[styles.summaryTitle, { color: Colors.text.primary }]}>Resumen antes de escanear</Text>
                  <SummaryLine icon="swap-vert" label="Tipo" value={entryType === 'PO_ENTRY' ? 'Entrada con orden de compra' : entryType === 'ENTRY' ? 'Entrada manual' : 'Carga inicial'} colors={Colors} />
                  {entryType !== 'INITIAL_LOAD' ? <SummaryLine icon="business" label="Proveedor" value={supplierName || 'Sin proveedor'} colors={Colors} /> : null}
                  {entryType === 'PO_ENTRY' && selectedOrder ? <SummaryLine icon="receipt-long" label="Orden" value={`#${selectedOrder.order_number || selectedOrder.id.slice(0, 8)} · ${orderItemsCount} producto${orderItemsCount !== 1 ? 's' : ''} · ${totalUnits} unidad${totalUnits !== 1 ? 'es' : ''}`} colors={Colors} /> : null}
                  <SummaryLine icon="warehouse" label="Bodega de destino" value={warehouseLabel || 'Bodega seleccionada'} colors={Colors} last />
                </View>
              ) : null}
              <Button
                title={isOrderComplete ? 'Orden completa — no se puede escanear' : 'Comenzar a escanear'}
                onPress={startEntry}
                disabled={!canStart}
                style={styles.button}
                icon="qr-code-scanner"
              />
            </>
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
        <Text style={[styles.title, { color: Colors.text.primary }]} accessibilityRole="header">Configurar entrada</Text>
        <Text style={[styles.subtitle, { color: Colors.text.secondary }]}>
          Complete los pasos para configurar la entrada de productos
        </Text>

        {catalogError ? (
          <View style={[styles.catalogError, { backgroundColor: `${Colors.error.main}14`, borderColor: Colors.error.main }]} accessibilityLiveRegion="polite">
            <MaterialIcons name="error-outline" size={20} color={Colors.error.main} />
            <Text style={[styles.catalogErrorText, { color: Colors.error.main }]}>{catalogError}</Text>
            <TouchableOpacity onPress={retryCatalogs} accessibilityRole="button" accessibilityLabel="Reintentar carga" style={styles.catalogRetry}>
              <MaterialIcons name="refresh" size={18} color={Colors.primary.main} />
              <Text style={[styles.refreshText, { color: Colors.primary.main }]}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {entryType ? <FlowStepper labels={stepLabels} current={dynamicStep} /> : null}

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

function SummaryLine({ icon, label, value, colors, last }: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  colors: ReturnType<typeof getColors>;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryLine, !last && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.summaryIcon, { backgroundColor: colors.surface.muted }]}><MaterialIcons name={icon} size={18} color={colors.primary.main} /></View>
      <View style={styles.summaryCopy}>
        <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>{label}</Text>
        <Text style={[styles.summaryValue, { color: colors.text.primary }]}>{value}</Text>
      </View>
    </View>
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
  container: { flex: 1 },
  card: { margin: Spacing.xl },
  title: { ...Typography.headline, marginBottom: Spacing.sm },
  subtitle: { ...Typography.bodySmall, marginBottom: Spacing.xxl },
  catalogError: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, padding: Spacing.md },
  catalogErrorText: { ...Typography.caption, flex: 1, fontWeight: '600' },
  catalogRetry: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs, minHeight: 44 },
  flowCards: { gap: Spacing.md },
  flowCard: { alignItems: 'center', borderRadius: Radius.card, borderWidth: 1, flexDirection: 'row', minHeight: 72, padding: Spacing.lg },
  flowIcon: { alignItems: 'center', borderRadius: Radius.control, height: 48, justifyContent: 'center', width: 48 },
  flowCopy: { flex: 1, marginHorizontal: Spacing.md },
  flowTitle: { ...Typography.bodyStrong },
  flowDescription: { ...Typography.metadata, marginTop: 3 },
  stepHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: Spacing.lg },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', marginRight: Spacing.sm, width: 44 },
  stepHeaderText: { flex: 1 },
  stepTitle: { ...Typography.section, fontSize: 18, lineHeight: 23, marginBottom: Spacing.xs },
  stepDescription: { ...Typography.bodySmall, marginBottom: Spacing.lg },
  searchContainer: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1.5, flexDirection: 'row', marginBottom: Spacing.xl, minHeight: 48, paddingHorizontal: Spacing.md },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: { ...Typography.body, flex: 1, height: 48 },
  clearButton: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: Spacing.sm, width: 44 },
  field: { marginBottom: Spacing.xl },
  fieldHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  label: { ...Typography.bodyStrong, flex: 1 },
  refreshButton: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: Spacing.sm, width: 44 },
  refreshContainer: { alignItems: 'flex-end', marginBottom: Spacing.lg },
  refreshButtonInline: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs, minHeight: 44, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  refreshText: { ...Typography.bodySmallStrong },
  continueButton: { marginTop: Spacing.sm },
  skipButton: { marginTop: Spacing.sm },
  supplierActions: { marginTop: Spacing.sm },
  purchaseOrderActions: { marginTop: Spacing.lg },
  button: { marginTop: Spacing.sm },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl },
  loadingText: { ...Typography.bodySmall, marginTop: Spacing.md },
  orderSummary: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl, padding: Spacing.lg },
  orderSummaryText: { flex: 1 },
  orderSummaryTitle: { ...Typography.bodyStrong, marginBottom: 2 },
  orderSummarySubtitle: { ...Typography.bodySmall },
  infoNote: { alignItems: 'flex-start', borderRadius: Radius.chip, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl, padding: Spacing.md },
  infoNoteText: { ...Typography.caption, flex: 1 },
  summaryCard: { borderRadius: Radius.control, borderWidth: 1, marginBottom: Spacing.lg, overflow: 'hidden' },
  summaryTitle: { ...Typography.bodySmallStrong, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  summaryLine: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  summaryIcon: { alignItems: 'center', borderRadius: Radius.chip, height: 36, justifyContent: 'center', width: 36 },
  summaryCopy: { flex: 1 },
  summaryLabel: { ...Typography.metadata },
  summaryValue: { ...Typography.bodySmallStrong, marginTop: 1 },
});
