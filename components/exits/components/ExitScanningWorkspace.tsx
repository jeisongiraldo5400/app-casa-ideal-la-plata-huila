import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import {
  type ExitItem,
  type FinalizeExitSummary,
  type ScanWarehouseCandidate,
  type SelectedDeliveryOrderProgressItem,
  useExitsStore,
} from '@/components/exits/infrastructure/store/exitsStore';
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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Stage = 'idle' | 'exit_review' | 'success';
type DashboardTab = 'session' | 'pending';
type DashboardRow =
  | { kind: 'session'; key: string; item: ExitItem; index: number }
  | { kind: 'pending'; key: string; progress: SelectedDeliveryOrderProgressItem };

const PENDING_PAGE_SIZE = 10;
const UNDO_WINDOW_MS = 6000;

export function ExitScanningWorkspace() {
  const store = useExitsStore();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useNetworkStatus();
  const [stage, setStage] = useState<Stage>('idle');
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMounted, setScannerMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('session');
  const [visiblePendingCount, setVisiblePendingCount] = useState(PENDING_PAGE_SIZE);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<FinalizeExitSummary | null>(null);
  const [undo, setUndo] = useState<{ item: ExitItem; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanGuardRef = useRef(false);
  const finalizeGuardRef = useRef(false);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const progress = store.getSelectedDeliveryOrderProgress();
  const order = store.selectedDeliveryOrder;
  const orderNumber = order?.order_number || order?.id.slice(0, 8) || '—';
  const recipient = order?.customer_name || order?.assigned_to_user_name || 'Destinatario';
  const pendingAtStart = Math.max((progress?.totalRequired || 0) - (progress?.totalRegistered || 0), 0);
  const scannedUnits = progress?.totalScanned || 0;
  const sessionUnits = store.exitItems.reduce((sum, item) => sum + item.quantity, 0);
  const remainingUnits = Math.max(pendingAtStart - scannedUnits, 0);
  const sessionProgress = pendingAtStart > 0 ? Math.min((scannedUnits / pendingAtStart) * 100, 100) : 100;
  const searching = store.loading && !store.finalizing && !store.currentProduct;
  const reviewing = stage === 'idle' && Boolean(store.currentProduct);

  const warehouseNames = useMemo(
    () => new Map((order?.items || []).map((item) => [item.warehouse_id, item.warehouse_name])),
    [order?.items],
  );
  const sessionRows = useMemo<DashboardRow[]>(
    () => store.exitItems.map((item, index) => ({ kind: 'session', key: `${item.product.id}-${item.warehouseId || index}`, item, index })),
    [store.exitItems],
  );
  const pendingItems = useMemo(() => (progress?.items || []).filter((item) => item.pending > 0), [progress?.items]);
  const pendingRows = useMemo<DashboardRow[]>(
    () => pendingItems.slice(0, visiblePendingCount).map((item) => ({ kind: 'pending', key: item.item.id, progress: item })),
    [pendingItems, visiblePendingCount],
  );
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

  const handleScan = async (barcode: string) => {
    if (scanGuardRef.current) return;
    scanGuardRef.current = true;
    setShowScanner(false);
    try {
      await store.scanBarcode(barcode.trim());
      const current = useExitsStore.getState();
      if (current.currentProduct) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      }
    } finally {
      scanGuardRef.current = false;
    }
  };

  const addCurrentProduct = async (scanNext: boolean) => {
    const current = useExitsStore.getState();
    if (!current.currentProduct) return;
    const result = await current.addProductToExit(current.currentProduct, current.currentQuantity, current.currentScannedBarcode || '');
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

  const cancelProductReview = () => {
    unmountScanner();
    store.resetCurrentScan();
    store.clearError();
    setReviewError(null);
  };

  const returnToSetup = () => {
    if (!store.exitItems.length) {
      store.goBackToSetup();
      return;
    }
    Alert.alert('Volver a la configuración', 'Se descartarán los productos agregados en esta salida.', [
      { text: 'Continuar escaneando', style: 'cancel' },
      { text: 'Descartar y volver', style: 'destructive', onPress: store.goBackToSetup },
    ]);
  };

  const removeSessionItem = (row: Extract<DashboardRow, { kind: 'session' }>) => {
    store.removeProductFromExit(row.index);
    setUndo({ item: row.item, index: row.index });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  };

  const undoRemove = () => {
    if (!undo) return;
    const result = store.restoreExitItem(undo.item, undo.index);
    setUndo(null);
    if (!result.ok) Alert.alert('No se pudo deshacer', result.error);
  };

  const finalize = async () => {
    if (!store.exitItems.length || finalizeGuardRef.current || store.loading) return;
    if (!user) {
      setReviewError('Usuario no autenticado');
      return;
    }
    if (!online) {
      setReviewError('Sin conexión: no se puede registrar la salida hasta recuperar la red.');
      return;
    }
    finalizeGuardRef.current = true;
    setReviewError(null);
    try {
      const result = await useExitsStore.getState().finalizeExit();
      if (!result.ok) {
        setReviewError(result.error.message || 'No fue posible registrar la salida');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        return;
      }
      unmountScanner();
      setSuccessSummary(result.summary);
      setStage('success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } finally {
      finalizeGuardRef.current = false;
    }
  };

  const scannerContext = order ? `Orden #${orderNumber} · ${remainingUnits} unidades pendientes` : undefined;
  const selectedCandidate = store.warehouseCandidates.find((candidate) => candidate.warehouseId === store.warehouseId);
  const reviewWarehouseName = selectedCandidate?.warehouseName || warehouseNames.get(store.warehouseId || '') || 'Bodega de la orden';
  const alreadyInSession = store.exitItems.find((item) => item.product.id === store.currentProduct?.id && item.warehouseId === store.warehouseId)?.quantity || 0;
  const reviewMax = store.currentPhysicalStock === null ? store.currentAvailableStock : Math.min(store.currentAvailableStock, store.currentPhysicalStock);
  const reviewOutOfStock = Boolean(store.warehouseId) && !store.loading && store.currentPhysicalStock === 0;
  const reviewValid = Boolean(store.warehouseId) && !store.loading && !reviewOutOfStock && store.currentQuantity > 0 && store.currentQuantity <= reviewMax;

  if (stage === 'success' && successSummary) {
    return (
      <SuccessScreen
        title="Salida registrada correctamente"
        description={`Orden #${successSummary.orderNumber} · ${successSummary.productCount} productos · ${successSummary.totalUnits} unidades`}
        status={{
          text: successSummary.orderCompleted ? 'La orden quedó completamente entregada.' : 'La orden conserva cantidades pendientes.',
          tone: successSummary.orderCompleted ? 'success' : 'primary',
          icon: successSummary.orderCompleted ? 'task-alt' : 'pending-actions',
        }}
        actions={[
          { title: 'Registrar otra salida', onPress: () => { setSuccessSummary(null); setStage('idle'); store.startNewSession(); } },
          { title: 'Volver a Mis órdenes', variant: 'outline', onPress: () => { store.reset(); router.replace('/(tabs)/my-orders' as never); } },
          { title: 'Cambiar destino', variant: 'ghost', onPress: store.reset },
        ]}
      />
    );
  }

  if (stage === 'exit_review') {
    return (
      <SessionReviewScreen
        title="Revisar salida"
        subtitle={`Orden #${orderNumber} · ${recipient}`}
        summaryTitle={`${store.exitItems.length} productos · ${sessionUnits} unidades`}
        summaryMeta={recipient}
        statusText={remainingUnits > 0 ? 'Esta salida dejará cantidades pendientes' : 'Esta salida completa la orden'}
        statusTone={remainingUnits > 0 ? 'warning' : 'success'}
        items={store.exitItems.map((item, index) => ({
          key: `${item.product.id}-${item.warehouseId || index}`,
          name: item.product.name,
          meta: `SKU: ${item.product.sku || '—'} · ${warehouseNames.get(item.warehouseId || '') || 'Bodega de la orden'}`,
          quantity: item.quantity,
        }))}
        observation={{ value: store.deliveryObservations, placeholder: 'Observación opcional', onChange: store.setDeliveryObservations }}
        error={reviewError}
        notice={online ? null : 'Sin conexión: el registro se habilitará al recuperar la red.'}
        loading={store.finalizing}
        finalizeDisabled={!online}
        finalizeLabel={`Registrar salida · ${sessionUnits} unidades`}
        onBack={() => { setReviewError(null); setStage('idle'); }}
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
              meta={`SKU: ${item.item.product.sku || '—'} · ${warehouseNames.get(item.item.warehouseId || '') || 'Bodega de la orden'}`}
              quantity={item.item.quantity}
              quantityCaption="Cantidad de esta salida"
              canDecrease={item.item.quantity > 1}
              canIncrease={Boolean(item.item.availableStock)}
              note={!item.item.availableStock ? (item.item.physicalStock != null && item.item.quantity >= item.item.physicalStock ? 'Sin más stock físico en esta bodega' : 'Sin más unidades pendientes en la orden') : null}
              onDecrease={() => store.updateProductQuantity(item.index, item.item.quantity - 1)}
              onIncrease={() => store.updateProductQuantity(item.index, item.item.quantity + 1)}
              onRemove={() => removeSessionItem(item)}
            />
          ) : (
            <PendingItemCard
              name={item.progress.item.product_name}
              meta={`${item.progress.item.warehouse_name} · Pendiente ${item.progress.pending}`}
              note={item.progress.item.notes}
              tone={item.progress.isComplete ? 'complete' : item.progress.sessionScanned > 0 ? 'partial' : 'pending'}
              expanded={expandedItemId === item.progress.item.id}
              metrics={[
                { label: 'Orden', value: item.progress.orderQuantity },
                { label: 'Entregado', value: item.progress.registered },
                { label: 'Esta salida', value: item.progress.sessionScanned, primary: true },
              ]}
              onPress={() => setExpandedItemId((current) => current === item.progress.item.id ? null : item.progress.item.id)}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: 150 + insets.bottom }]}
          ListHeaderComponent={
            <View>
              <SessionProgressHeader
                title={`Orden #${orderNumber}`}
                detail={recipient}
                percentage={sessionProgress}
                progressLabel={`${scannedUnits} de ${pendingAtStart} escaneadas`}
                remainingLabel={`${remainingUnits} pendientes`}
                backLabel="Volver a la configuración"
                onBack={returnToSetup}
              />
              {searching ? (
                <View style={[styles.searching, { backgroundColor: colors.surface.muted }]} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={colors.primary.main} />
                  <Text style={[styles.searchingText, { color: colors.text.secondary }]}>{store.loadingMessage || 'Buscando producto…'}</Text>
                </View>
              ) : null}
              {!online ? <ErrorBanner tone="warning" icon="wifi-off" message="Sin conexión. Las lecturas y el registro fallarán hasta recuperar la red." /> : null}
              {store.error && !reviewing ? (
                <ErrorBanner message={store.error} actionLabel="Escanear de nuevo" onAction={openScanner} onDismiss={store.clearError} />
              ) : null}
              <SegmentedControl
                value={activeTab}
                onChange={(value) => setActiveTab(value as DashboardTab)}
                items={[
                  { value: 'session', label: 'Esta salida', icon: 'shopping-cart', badge: store.exitItems.length },
                  { value: 'pending', label: 'Pendientes', icon: 'inventory-2', badge: pendingItems.length },
                ]}
              />
              <Text style={[styles.sectionHint, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Productos preparados para registrar' : 'Lo que falta por entregar de la orden'}</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
              <MaterialIcons name={activeTab === 'session' ? 'qr-code-scanner' : 'inventory-2'} size={34} color={colors.primary.main} />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{activeTab === 'session' ? 'Aún no has agregado productos' : 'No hay productos pendientes'}</Text>
              <Text style={[styles.emptyText, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Escanea el primer producto o consulta lo que falta en la orden.' : progress ? 'Todos los productos de la orden están completos.' : 'No se encontró información de progreso.'}</Text>
              {activeTab === 'session' && pendingItems.length > 0 ? (
                <Button title={`Ver productos pendientes (${pendingItems.length})`} variant="outline" onPress={() => setActiveTab('pending')} style={styles.emptyAction} />
              ) : null}
            </View>
          }
          ListFooterComponent={activeTab === 'pending' && pendingItems.length > visiblePendingCount ? (
            <Button
              title={`Ver ${Math.min(PENDING_PAGE_SIZE, pendingItems.length - visiblePendingCount)} productos más`}
              variant="outline"
              onPress={() => setVisiblePendingCount((count) => count + PENDING_PAGE_SIZE)}
              style={styles.loadMore}
            />
          ) : null}
        />

        <View style={[styles.stickyFooter, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <View style={styles.footerSummary}>
            <Text style={[styles.footerTotal, { color: colors.text.primary }]}>{store.exitItems.length} productos · {sessionUnits} unidades</Text>
            <Text style={[styles.footerPending, { color: colors.text.secondary }]}>{remainingUnits} unidades pendientes en la orden</Text>
          </View>
          <View style={styles.footerButtons}>
            <Button title={store.exitItems.length ? 'Escanear otro' : 'Escanear producto'} variant={store.exitItems.length ? 'outline' : 'primary'} onPress={openScanner} style={styles.footerButton} />
            {store.exitItems.length ? (
              <Button title="Revisar salida" onPress={() => { unmountScanner(); setStage('exit_review'); }} style={styles.footerButton} />
            ) : pendingItems.length > 0 ? (
              <Button title={`Ver pendientes (${pendingItems.length})`} variant="outline" onPress={() => setActiveTab('pending')} style={styles.footerButton} />
            ) : null}
          </View>
        </View>

        <UndoToast
          visible={Boolean(undo)}
          message={undo ? `Quitaste ${undo.item.product.name}` : ''}
          bottomOffset={150 + insets.bottom}
          onAction={undoRemove}
        />
      </View>

      {store.currentProduct ? (
        <ProductReviewSheet
          visible={reviewing}
          product={{ name: store.currentProduct.name, sku: store.currentProduct.sku || null, barcode: store.currentScannedBarcode || store.currentProduct.barcode || '' }}
          subtitle={store.warehouseCandidates.length > 1 && !store.warehouseId ? 'Elige la bodega y confirma la cantidad' : 'Confirma la cantidad antes de agregar'}
          showQuantity={Boolean(store.warehouseId) && !reviewOutOfStock}
          quantityLabel="Cantidad para agregar"
          quantity={store.currentQuantity}
          maxQuantity={reviewMax}
          busy={store.loading}
          valid={reviewValid}
          error={reviewError || store.error}
          addLabel="Agregar y volver al resumen"
          onQuantityChange={store.setQuantity}
          onCancel={cancelProductReview}
          onAdd={() => void addCurrentProduct(false)}
          onAddAndScan={() => void addCurrentProduct(true)}
        >
          <ExitReviewDetails
            candidates={store.warehouseCandidates}
            selectedWarehouseId={store.warehouseId}
            warehouseName={reviewWarehouseName}
            pending={store.currentAvailableStock}
            physicalStock={store.currentPhysicalStock}
            stockLoading={store.loading}
            alreadyInSession={alreadyInSession}
            onSelectWarehouse={(warehouseId) => { setReviewError(null); void store.selectScanWarehouse(warehouseId); }}
          />
        </ProductReviewSheet>
      ) : null}

      {scannerMounted ? (
        <View style={[styles.scannerOverlay, !showScanner && styles.scannerHidden]} pointerEvents={showScanner ? 'auto' : 'none'}>
          <BarcodeScanner
            active={showScanner}
            onScan={handleScan}
            onClose={unmountScanner}
            title="Escanear producto de la salida"
            contextLabel={scannerContext}
            instruction="Ubica el código dentro del recuadro"
            logModule="exits"
          />
          {showScanner ? (
            <ScanSessionBar
              productCount={store.exitItems.length}
              unitCount={sessionUnits}
              unitLabel="unidades"
              lastItems={[...store.exitItems].reverse().map((item) => item.product.name)}
              bottomInset={insets.bottom}
              onShowList={() => setShowScanner(false)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ExitReviewDetails({ candidates, selectedWarehouseId, warehouseName, pending, physicalStock, stockLoading, alreadyInSession, onSelectWarehouse }: {
  candidates: ScanWarehouseCandidate[];
  selectedWarehouseId: string | null;
  warehouseName: string;
  pending: number;
  physicalStock: number | null;
  stockLoading: boolean;
  alreadyInSession: number;
  onSelectWarehouse: (warehouseId: string) => void;
}) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const needsChoice = candidates.length > 1;
  const hasWarehouse = Boolean(selectedWarehouseId);
  const outOfStock = hasWarehouse && !stockLoading && physicalStock === 0;
  return (
    <View style={styles.details}>
      {needsChoice ? (
        <View style={styles.warehouseChoice} accessibilityRole="radiogroup">
          <Text style={[styles.detailsTitle, { color: colors.text.primary }]}>¿De qué bodega sale?</Text>
          <Text style={[styles.detailsHint, { color: colors.text.secondary }]}>Este producto tiene unidades pendientes en {candidates.length} bodegas.</Text>
          {candidates.map((candidate) => {
            const selected = candidate.warehouseId === selectedWarehouseId;
            return (
              <Pressable
                key={candidate.warehouseId}
                onPress={() => onSelectWarehouse(candidate.warehouseId)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${candidate.warehouseName}, ${candidate.pending} pendientes`}
                style={({ pressed }) => [styles.warehouseOption, { borderColor: selected ? colors.primary.main : colors.divider, backgroundColor: selected ? `${colors.primary.main}12` : colors.background.default }, pressed && styles.pressed]}
              >
                <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={selected ? colors.primary.main : colors.text.secondary} />
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionName, { color: colors.text.primary }]}>{candidate.warehouseName}</Text>
                  <Text style={[styles.detailsHint, { color: colors.text.secondary }]}>Pendiente en la orden: {candidate.pending}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={[styles.warehouseRow, { backgroundColor: colors.surface.muted }]}>
          <MaterialIcons name="warehouse" size={20} color={colors.primary.main} />
          <View style={styles.optionCopy}>
            <Text style={[styles.detailsHint, { color: colors.text.secondary }]}>Bodega de la orden</Text>
            <Text style={[styles.optionName, { color: colors.text.primary }]}>{warehouseName}</Text>
          </View>
        </View>
      )}

      {hasWarehouse ? (
        <View style={styles.metrics}>
          <FlowMetric label="Pendiente" value={pending} primary />
          <FlowMetric label="Stock en bodega" value={stockLoading ? '…' : physicalStock === null ? '—' : physicalStock} warning={outOfStock} />
          <FlowMetric label="Ya agregado" value={alreadyInSession} warning={alreadyInSession > 0} />
        </View>
      ) : null}
      {hasWarehouse && !stockLoading && physicalStock === null ? (
        <Text style={[styles.detailsHint, { color: colors.text.secondary, textAlign: 'center' }]}>No se pudo consultar el stock físico; se validará al registrar la salida.</Text>
      ) : null}
      {outOfStock ? (
        <Text style={[styles.detailsWarning, { color: colors.error.main }]}>Sin stock físico en {warehouseName}. {needsChoice ? 'Elige otra bodega o revisa el inventario.' : 'Revisa el inventario antes de continuar.'}</Text>
      ) : null}
      {hasWarehouse && alreadyInSession > 0 ? (
        <Text style={[styles.detailsWarning, { color: colors.warning.main }]}>Ya tienes {alreadyInSession} de este producto en esta salida; la cantidad se sumará.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  scannerHidden: { opacity: 0 },
  listContent: { padding: Spacing.lg },
  searching: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, padding: Spacing.md },
  searchingText: { ...Typography.bodySmallStrong },
  sectionHint: { ...Typography.metadata, marginBottom: Spacing.sm, marginTop: Spacing.sm, textAlign: 'center' },
  emptyCard: { alignItems: 'center', borderRadius: Radius.card, borderWidth: 1, gap: Spacing.sm, padding: Spacing.xxl },
  emptyTitle: { ...Typography.bodyStrong },
  emptyText: { ...Typography.caption, textAlign: 'center' },
  emptyAction: { marginTop: Spacing.sm, width: '100%' },
  loadMore: { marginTop: Spacing.sm },
  stickyFooter: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, gap: Spacing.sm, left: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, position: 'absolute', right: 0, ...Shadows.floating },
  footerSummary: { alignItems: 'center' },
  footerTotal: { ...Typography.bodySmallStrong },
  footerPending: { ...Typography.metadata, marginTop: 2 },
  footerButtons: { flexDirection: 'row', gap: Spacing.sm },
  footerButton: { flex: 1, paddingHorizontal: Spacing.sm },
  details: { gap: Spacing.md },
  detailsTitle: { ...Typography.bodySmallStrong },
  detailsHint: { ...Typography.metadata },
  detailsWarning: { ...Typography.bodySmallStrong, textAlign: 'center' },
  warehouseChoice: { gap: Spacing.sm },
  warehouseOption: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1.5, flexDirection: 'row', gap: Spacing.md, minHeight: 56, padding: Spacing.md },
  warehouseRow: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  optionCopy: { flex: 1 },
  optionName: { ...Typography.bodySmallStrong },
  metrics: { flexDirection: 'row', gap: Spacing.sm },
  pressed: { opacity: 0.8 },
});
