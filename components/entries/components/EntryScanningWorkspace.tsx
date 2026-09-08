import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { type EntryItem, type FinalizeEntrySummary, type SelectedPurchaseOrderProgressItem, useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import {
  ErrorBanner,
  FlowMetric,
  PendingItemCard,
  ProductReviewSheet,
  ScanSessionBar,
  SessionItemCard,
  SessionProgressHeader,
  SessionReviewScreen,
  SuccessScreen,
  UndoToast,
} from '@/components/inventory-flow';
import { BarcodeScanner } from '@/components/scanning';
import { useTheme } from '@/components/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'session' | 'pending';
type Row =
  | { kind: 'session'; key: string; item: EntryItem; index: number }
  | { kind: 'pending'; key: string; progress: SelectedPurchaseOrderProgressItem };

const PAGE_SIZE = 20;
const MAX_MANUAL_QUANTITY = 1_000_000;
const UNDO_WINDOW_MS = 6000;

const TYPE_LABELS = {
  PO_ENTRY: 'Entrada con OC',
  ENTRY: 'Entrada manual',
  INITIAL_LOAD: 'Carga inicial',
} as const;

export function EntryScanningWorkspace() {
  const store = useEntriesStore();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useNetworkStatus();
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMounted, setScannerMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('session');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<FinalizeEntrySummary | null>(null);
  const [undo, setUndo] = useState<{ item: EntryItem; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanGuard = useRef(false);
  const finalizeGuard = useRef(false);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const progress = store.getSelectedPurchaseOrderProgress();
  const pendingAtStart = progress ? Math.max(progress.totalRequired - progress.totalRegistered, 0) : 0;
  const remaining = progress ? Math.max(pendingAtStart - progress.totalScanned, 0) : null;
  const sessionUnits = store.entryItems.reduce((sum, item) => sum + item.quantity, 0);
  const percentage = progress ? (pendingAtStart > 0 ? Math.min((progress.totalScanned / pendingAtStart) * 100, 100) : 100) : null;
  const pendingItems = useMemo(() => (progress?.items || []).filter((item) => item.pending > 0), [progress?.items]);
  const currentProgress = progress?.items.find((item) => item.item.product_id === store.currentProduct?.id);
  const maxCurrentQuantity = store.purchaseOrderId ? currentProgress?.pending || 0 : MAX_MANUAL_QUANTITY;
  const warehouseName = store.warehouses.find((item) => item.id === store.warehouseId)?.name || 'Bodega seleccionada';
  const typeLabel = TYPE_LABELS[store.entryType || 'ENTRY'];
  const orderTitle = store.selectedPurchaseOrder ? `OC #${store.selectedPurchaseOrder.order_number || store.selectedPurchaseOrder.id.slice(0, 8)}` : typeLabel;
  const reviewing = store.uiStage === 'product_review' && Boolean(store.currentProduct);
  const alreadyAdded = store.entryItems.find((item) => item.product.id === store.currentProduct?.id)?.quantity || 0;

  const sessionRows = useMemo<Row[]>(() => store.entryItems.map((item, index) => ({ kind: 'session', key: item.product.id, item, index })), [store.entryItems]);
  const pendingRows = useMemo<Row[]>(() => pendingItems.slice(0, visibleCount).map((item) => ({ kind: 'pending', key: item.item.id, progress: item })), [pendingItems, visibleCount]);
  const rows = activeTab === 'session' ? sessionRows : pendingRows;

  const openScanner = () => {
    store.clearError();
    setReviewError(null);
    setScannerMounted(true);
    setShowScanner(true);
  };

  const unmountScanner = () => {
    setShowScanner(false);
    setScannerMounted(false);
  };

  const handleScan = useCallback(async (barcode: string) => {
    if (scanGuard.current) return;
    scanGuard.current = true;
    setShowScanner(false);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = await useEntriesStore.getState().scanBarcode(barcode.trim());
      if (result.status === 'found') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        return;
      }
      if (result.status === 'not_found') return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      scanGuard.current = false;
    }
  }, []);

  const addProduct = async (scanNext: boolean) => {
    const current = useEntriesStore.getState();
    if (!current.currentProduct) return;
    const result = await current.addProductToEntry(current.currentProduct, current.currentQuantity, current.currentScannedBarcode || '');
    if (!result.ok) {
      setReviewError(result.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      return;
    }
    setReviewError(null);
    setActiveTab('session');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (scanNext) {
      setScannerMounted(true);
      setShowScanner(true);
      return;
    }
    unmountScanner();
  };

  const cancelReview = () => {
    unmountScanner();
    setReviewError(null);
    store.resetCurrentScan();
  };

  const returnToConfiguration = () => {
    if (!store.entryItems.length) {
      store.goBackToSetup();
      return;
    }
    Alert.alert('Cambiar configuración', 'Se descartarán los productos agregados en esta entrada.', [
      { text: 'Continuar recibiendo', style: 'cancel' },
      { text: 'Descartar y volver', style: 'destructive', onPress: () => {
        useEntriesStore.setState({ entryItems: [], scannedItemsProgress: new Map() });
        store.goBackToSetup();
      } },
    ]);
  };

  const removeItem = (row: Extract<Row, { kind: 'session' }>) => {
    store.removeProductFromEntry(row.index);
    setUndo({ item: row.item, index: row.index });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  };

  const undoRemove = () => {
    if (!undo) return;
    const result = store.restoreEntryItem(undo.item, undo.index);
    setUndo(null);
    if (!result.ok) Alert.alert('No se pudo deshacer', result.error);
  };

  const finalize = async () => {
    if (!user || finalizeGuard.current || store.loading || !store.entryItems.length) return;
    if (!online) {
      setReviewError('Sin conexión: no se puede registrar la entrada hasta recuperar la red.');
      return;
    }
    finalizeGuard.current = true;
    setReviewError(null);
    try {
      const result = await useEntriesStore.getState().finalizeEntry(user.id);
      if (!result.ok) {
        setReviewError(result.error.message || 'No fue posible registrar la entrada');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        return;
      }
      unmountScanner();
      setSuccessSummary(result.summary);
      useEntriesStore.getState().setUiStage('success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } finally {
      finalizeGuard.current = false;
    }
  };

  const scannerContext = store.selectedPurchaseOrder
    ? `${orderTitle} · ${remaining} pendientes`
    : `${typeLabel} · ${warehouseName}`;

  if (store.uiStage === 'success') {
    const summary = successSummary;
    return (
      <SuccessScreen
        title="Entrada registrada correctamente"
        description={summary ? `${summary.productCount} productos · ${summary.totalUnits} unidades` : 'Los productos ya suman al inventario de la bodega.'}
        status={summary?.orderNumber ? {
          text: summary.orderCompleted ? `OC #${summary.orderNumber} quedó completa.` : `OC #${summary.orderNumber} conserva cantidades pendientes.`,
          tone: summary.orderCompleted ? 'success' : 'primary',
          icon: summary.orderCompleted ? 'task-alt' : 'pending-actions',
        } : null}
        actions={[
          { title: 'Registrar otra entrada', onPress: () => { setSuccessSummary(null); store.startNewSession(); } },
          { title: 'Ver inventario', variant: 'outline', onPress: () => { store.reset(); router.replace('/(tabs)/inventory' as never); } },
          { title: 'Cambiar configuración', variant: 'ghost', onPress: store.reset },
        ]}
      />
    );
  }

  if (store.uiStage === 'entry_review') {
    const supplier = store.suppliers.find((item) => item.id === store.supplierId)?.name || null;
    return (
      <SessionReviewScreen
        title="Revisar entrada"
        subtitle={`${typeLabel}${store.selectedPurchaseOrder?.order_number ? ` · OC #${store.selectedPurchaseOrder.order_number}` : ''}`}
        summaryTitle={`${store.entryItems.length} productos · ${sessionUnits} unidades`}
        summaryMeta={`${supplier ? `${supplier} · ` : ''}${warehouseName}`}
        statusText={store.selectedPurchaseOrder ? (remaining !== null && remaining > 0 ? 'La orden conservará cantidades pendientes' : 'Esta entrada completa la orden') : null}
        statusTone={remaining !== null && remaining > 0 ? 'warning' : 'success'}
        items={store.entryItems.map((item) => ({ key: item.product.id, name: item.product.name, meta: `SKU: ${item.product.sku || '—'}`, quantity: item.quantity }))}
        error={reviewError}
        notice={online ? null : 'Sin conexión: el registro se habilitará al recuperar la red.'}
        loading={store.finalizing}
        finalizeDisabled={!online}
        finalizeLabel={`Registrar entrada · ${sessionUnits} unidades`}
        onBack={() => { setReviewError(null); store.setUiStage('idle'); }}
        onFinalize={() => void finalize()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.container, { backgroundColor: colors.background.default }]}>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => item.kind === 'session' ? (
            <SessionItemCard
              name={item.item.product.name}
              meta={`SKU: ${item.item.product.sku || '—'}`}
              quantity={item.item.quantity}
              quantityCaption="Cantidad recibida"
              canDecrease={item.item.quantity > 1}
              canIncrease={!store.purchaseOrderId || (progress?.items.find((line) => line.item.product_id === item.item.product.id)?.pending || 0) > 0}
              onDecrease={() => store.updateProductQuantity(item.index, item.item.quantity - 1)}
              onIncrease={() => store.updateProductQuantity(item.index, item.item.quantity + 1)}
              onRemove={() => removeItem(item)}
            />
          ) : (
            <PendingItemCard
              name={item.progress.item.product?.name || 'Producto'}
              meta={`SKU: ${item.progress.item.product?.sku || '—'} · Pendiente ${item.progress.pending}`}
              tone={item.progress.isComplete ? 'complete' : item.progress.sessionScanned > 0 ? 'partial' : 'pending'}
              expanded={expandedId === item.progress.item.id}
              metrics={[
                { label: 'Orden', value: item.progress.orderQuantity },
                { label: 'Ya recibido', value: item.progress.registered },
                { label: 'Esta entrada', value: item.progress.sessionScanned, primary: true },
              ]}
              onPress={() => setExpandedId((value) => value === item.progress.item.id ? null : item.progress.item.id)}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: 155 + insets.bottom }]}
          ListHeaderComponent={
            <View>
              <SessionProgressHeader
                title={orderTitle}
                detail={warehouseName}
                percentage={percentage}
                progressLabel={`${progress?.totalScanned || 0} de ${pendingAtStart} recibidas`}
                remainingLabel={`${remaining ?? 0} pendientes`}
                manualHint="Recibe productos en la bodega seleccionada"
                backLabel="Cambiar configuración"
                onBack={returnToConfiguration}
              />
              {!online ? <ErrorBanner tone="warning" icon="wifi-off" message="Sin conexión. Las lecturas y el registro fallarán hasta recuperar la red." /> : null}
              {store.error && !reviewing ? (
                <ErrorBanner message={store.error} actionLabel="Escanear de nuevo" onAction={openScanner} onDismiss={store.clearError} />
              ) : null}
              {store.purchaseOrderId ? (
                <SegmentedControl
                  value={activeTab}
                  onChange={(value) => setActiveTab(value as Tab)}
                  items={[
                    { value: 'session', label: 'Esta entrada', icon: 'add-box', badge: store.entryItems.length },
                    { value: 'pending', label: 'Pendientes OC', icon: 'inventory-2', badge: pendingItems.length },
                  ]}
                />
              ) : null}
              <Text style={[styles.hint, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Productos preparados para registrar' : 'Productos que todavía faltan por recibir'}</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
              <MaterialIcons name={activeTab === 'session' ? 'qr-code-scanner' : 'inventory-2'} size={34} color={colors.primary.main} />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{activeTab === 'session' ? 'Aún no has agregado productos' : 'La orden no tiene productos pendientes'}</Text>
              <Text style={[styles.emptyText, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Escanea el primer producto para comenzar.' : 'Todos los productos ya fueron recibidos.'}</Text>
            </View>
          }
          ListFooterComponent={activeTab === 'pending' && pendingItems.length > visibleCount ? (
            <Button title={`Ver ${Math.min(PAGE_SIZE, pendingItems.length - visibleCount)} productos más`} variant="outline" onPress={() => setVisibleCount((value) => value + PAGE_SIZE)} />
          ) : null}
        />

        <View style={[styles.footer, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <View style={styles.footerSummary}>
            <Text style={[styles.footerTotal, { color: colors.text.primary }]}>{store.entryItems.length} productos · {sessionUnits} unidades</Text>
            {remaining !== null ? <Text style={[styles.footerMeta, { color: colors.text.secondary }]}>{remaining} unidades pendientes en la OC</Text> : null}
          </View>
          <View style={styles.footerButtons}>
            <Button title={store.entryItems.length ? 'Escanear otro' : 'Escanear producto'} variant={store.entryItems.length ? 'outline' : 'primary'} onPress={openScanner} style={styles.flexButton} />
            {store.entryItems.length ? <Button title="Revisar entrada" onPress={() => { unmountScanner(); store.setUiStage('entry_review'); }} style={styles.flexButton} /> : null}
          </View>
        </View>

        <UndoToast
          visible={Boolean(undo)}
          message={undo ? `Quitaste ${undo.item.product.name}` : ''}
          bottomOffset={155 + insets.bottom}
          onAction={undoRemove}
        />
      </View>

      {store.currentProduct ? (
        <ProductReviewSheet
          visible={reviewing}
          product={{ name: store.currentProduct.name, sku: store.currentProduct.sku || null, barcode: store.currentScannedBarcode || store.currentProduct.barcode || '' }}
          quantityLabel="Cantidad para recibir"
          quantity={store.currentQuantity}
          maxQuantity={maxCurrentQuantity}
          valid={store.currentQuantity > 0 && store.currentQuantity <= maxCurrentQuantity}
          error={reviewError || store.error}
          addLabel="Agregar y volver al resumen"
          onQuantityChange={store.setQuantity}
          onCancel={cancelReview}
          onAdd={() => void addProduct(false)}
          onAddAndScan={() => void addProduct(true)}
        >
          <View style={[styles.warehouseRow, { backgroundColor: colors.surface.muted }]}>
            <MaterialIcons name="warehouse" size={20} color={colors.primary.main} />
            <View style={styles.warehouseCopy}>
              <Text style={[styles.warehouseLabel, { color: colors.text.secondary }]}>Bodega de destino</Text>
              <Text style={[styles.warehouseName, { color: colors.text.primary }]}>{warehouseName}</Text>
            </View>
          </View>
          <View style={styles.metrics}>
            {store.purchaseOrderId ? <FlowMetric label="Pendiente en OC" value={maxCurrentQuantity} primary /> : null}
            <FlowMetric label="Ya agregado" value={alreadyAdded} warning={alreadyAdded > 0} />
          </View>
          {alreadyAdded > 0 ? (
            <Text style={[styles.sessionNote, { color: colors.warning.main }]}>Ya tienes {alreadyAdded} de este producto en esta entrada; la cantidad se sumará.</Text>
          ) : null}
        </ProductReviewSheet>
      ) : null}

      {scannerMounted ? (
        <View style={[styles.scannerOverlay, !showScanner && styles.scannerHidden]} pointerEvents={showScanner ? 'auto' : 'none'}>
          <BarcodeScanner
            active={showScanner}
            onScan={handleScan}
            onClose={unmountScanner}
            title="Escanear producto de entrada"
            contextLabel={scannerContext}
            instruction="Ubica el código dentro del recuadro"
            logModule="entries"
          />
          {showScanner ? (
            <ScanSessionBar
              productCount={store.entryItems.length}
              unitCount={sessionUnits}
              unitLabel="unidades"
              lastItems={[...store.entryItems].reverse().map((item) => item.product.name)}
              bottomInset={insets.bottom}
              onShowList={() => setShowScanner(false)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  scannerHidden: { opacity: 0 },
  listContent: { padding: Spacing.lg },
  hint: { ...Typography.metadata, marginBottom: Spacing.sm, marginTop: Spacing.sm, textAlign: 'center' },
  empty: { alignItems: 'center', borderRadius: Radius.card, borderWidth: 1, gap: Spacing.sm, padding: Spacing.xxl },
  emptyTitle: { ...Typography.bodyStrong },
  emptyText: { ...Typography.caption, textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, gap: Spacing.sm, left: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, position: 'absolute', right: 0, ...Shadows.floating },
  footerSummary: { alignItems: 'center' },
  footerTotal: { ...Typography.bodySmallStrong },
  footerMeta: { ...Typography.metadata, marginTop: 2 },
  footerButtons: { flexDirection: 'row', gap: Spacing.sm },
  flexButton: { flex: 1, paddingHorizontal: Spacing.sm },
  warehouseRow: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  warehouseCopy: { flex: 1 },
  warehouseLabel: { ...Typography.metadata },
  warehouseName: { ...Typography.bodySmallStrong },
  metrics: { flexDirection: 'row', gap: Spacing.sm },
  sessionNote: { ...Typography.bodySmallStrong, textAlign: 'center' },
});
