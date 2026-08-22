import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { type EntryItem, type FinalizeEntrySummary, type SelectedPurchaseOrderProgressItem, useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ScreenState } from '@/components/ui/ScreenState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'session' | 'pending';
type Row =
  | { kind: 'session'; key: string; item: EntryItem; index: number }
  | { kind: 'pending'; key: string; progress: SelectedPurchaseOrderProgressItem };
const PAGE_SIZE = 20;
const MAX_MANUAL_QUANTITY = 1_000_000;

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
  const [showScanner, setShowScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('session');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<FinalizeEntrySummary | null>(null);
  const scanGuard = useRef(false);
  const finalizeGuard = useRef(false);

  const progress = store.getSelectedPurchaseOrderProgress();
  const pendingAtStart = progress ? Math.max(progress.totalRequired - progress.totalRegistered, 0) : 0;
  const remaining = progress ? Math.max(pendingAtStart - progress.totalScanned, 0) : null;
  const sessionUnits = store.entryItems.reduce((sum, item) => sum + item.quantity, 0);
  const percentage = progress && pendingAtStart > 0 ? Math.min((progress.totalScanned / pendingAtStart) * 100, 100) : null;
  const pendingItems = (progress?.items || []).filter((item) => item.pending > 0);
  const currentProgress = progress?.items.find((item) => item.item.product_id === store.currentProduct?.id);
  const maxCurrentQuantity = store.purchaseOrderId ? currentProgress?.pending || 0 : MAX_MANUAL_QUANTITY;
  const warehouseName = store.warehouses.find((item) => item.id === store.warehouseId)?.name || 'Bodega seleccionada';

  const sessionRows = useMemo<Row[]>(() => store.entryItems.map((item, index) => ({ kind: 'session', key: item.product.id, item, index })), [store.entryItems]);
  const pendingRows = useMemo<Row[]>(() => pendingItems.slice(0, visibleCount).map((item) => ({ kind: 'pending', key: item.item.id, progress: item })), [pendingItems, visibleCount]);
  const rows = activeTab === 'session' ? sessionRows : pendingRows;

  const openScanner = () => {
    store.clearError();
    setReviewError(null);
    setShowScanner(true);
  };

  const handleScan = async (barcode: string) => {
    if (scanGuard.current) return;
    scanGuard.current = true;
    try {
      const result = await store.scanBarcode(barcode.trim());
      if (result.status === 'found') {
        setShowScanner(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        return;
      }
      if (result.status === 'not_found') {
        setShowScanner(false);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      throw new Error(result.error);
    } finally {
      scanGuard.current = false;
    }
  };

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
    if (scanNext) setShowScanner(true);
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

  const finalize = async () => {
    if (!user || finalizeGuard.current || store.loading || !store.entryItems.length) return;
    finalizeGuard.current = true;
    setReviewError(null);
    try {
      const result = await useEntriesStore.getState().finalizeEntry(user.id);
      if (!result.ok) {
        setReviewError(result.error?.message || String(result.error) || 'No fue posible registrar la entrada');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        return;
      }
      setSuccessSummary(result.summary);
      useEntriesStore.getState().setUiStage('success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } finally {
      finalizeGuard.current = false;
    }
  };

  if (showScanner) {
    const context = store.selectedPurchaseOrder
      ? `OC #${store.selectedPurchaseOrder.order_number || store.selectedPurchaseOrder.id.slice(0, 8)} · ${remaining} pendientes`
      : `${TYPE_LABELS[store.entryType || 'ENTRY']} · ${warehouseName}`;
    return <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} title="Escanear producto de entrada" contextLabel={context} instruction="Ubica el código dentro del recuadro" />;
  }

  if (store.uiStage === 'product_review' && store.currentProduct) {
    return (
      <ProductReview
        colors={colors}
        bottomInset={insets.bottom}
        product={store.currentProduct}
        barcode={store.currentScannedBarcode || store.currentProduct.barcode || ''}
        warehouse={warehouseName}
        pending={store.purchaseOrderId ? maxCurrentQuantity : null}
        alreadyAdded={store.entryItems.find((item) => item.product.id === store.currentProduct?.id)?.quantity || 0}
        quantity={store.currentQuantity}
        error={reviewError || store.error}
        onQuantityChange={store.setQuantity}
        onCancel={store.resetCurrentScan}
        onAdd={() => void addProduct(false)}
        onAddAndScan={() => void addProduct(true)}
      />
    );
  }

  if (store.uiStage === 'entry_review') {
    return (
      <EntryReview
        colors={colors}
        bottomInset={insets.bottom}
        type={store.entryType ? TYPE_LABELS[store.entryType] : 'Entrada'}
        orderNumber={store.selectedPurchaseOrder?.order_number || null}
        supplier={store.suppliers.find((item) => item.id === store.supplierId)?.name || null}
        warehouse={warehouseName}
        items={store.entryItems}
        partial={remaining !== null && remaining > 0}
        loading={store.loading}
        error={reviewError}
        onBack={() => { setReviewError(null); store.setUiStage('idle'); }}
        onFinalize={() => void finalize()}
      />
    );
  }

  if (store.uiStage === 'success' && successSummary) {
    return (
      <View style={[styles.success, { backgroundColor: colors.background.default }]}>
        <ScreenState title="Entrada registrada correctamente" description={`${successSummary.productCount} productos · ${successSummary.totalUnits} unidades`} icon="check-circle" />
        {successSummary.orderNumber ? <Text style={[styles.successNote, { color: colors.text.secondary }]}>OC #{successSummary.orderNumber} {successSummary.orderCompleted ? 'completada' : 'con cantidades pendientes'}</Text> : null}
        <View style={styles.successActions}>
          <Button title="Ver inventario" onPress={() => { store.reset(); router.replace('/(tabs)/inventory' as never); }} />
          <Button title="Registrar otra entrada" variant="outline" onPress={store.reset} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => item.kind === 'session' ? (
          <SessionCard
            item={item.item}
            colors={colors}
            onDecrease={() => store.updateProductQuantity(item.index, item.item.quantity - 1)}
            onIncrease={() => store.updateProductQuantity(item.index, item.item.quantity + 1)}
            onRemove={() => Alert.alert('Quitar producto', `¿Quitar ${item.item.product.name}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => store.removeProductFromEntry(item.index) }])}
          />
        ) : (
          <PendingCard item={item.progress} colors={colors} expanded={expandedId === item.progress.item.id} onPress={() => setExpandedId((value) => value === item.progress.item.id ? null : item.progress.item.id)} />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: 155 + insets.bottom }]}
        ListHeaderComponent={<View>
          <WorkspaceHeader colors={colors} title={store.selectedPurchaseOrder ? `OC #${store.selectedPurchaseOrder.order_number || store.selectedPurchaseOrder.id.slice(0, 8)}` : TYPE_LABELS[store.entryType || 'ENTRY']} detail={warehouseName} percentage={percentage} sessionUnits={sessionUnits} remaining={remaining} onBack={returnToConfiguration} />
          {store.error ? <View style={[styles.errorBanner, { backgroundColor: `${colors.error.main}14`, borderColor: colors.error.main }]}><MaterialIcons name="error-outline" size={20} color={colors.error.main} /><Text style={[styles.errorText, { color: colors.error.main }]}>{store.error}</Text><Pressable onPress={openScanner}><Text style={{ color: colors.primary.main, fontWeight: '800' }}>Reintentar</Text></Pressable></View> : null}
          {store.purchaseOrderId ? <SegmentedControl value={activeTab} onChange={(value) => setActiveTab(value as Tab)} items={[{ value: 'session', label: 'Esta entrada', icon: 'add-box', badge: store.entryItems.length }, { value: 'pending', label: 'Pendientes OC', icon: 'inventory-2', badge: pendingItems.length }]} /> : null}
          <Text style={[styles.hint, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Productos preparados para registrar' : 'Productos que todavía faltan por recibir'}</Text>
        </View>}
        ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><MaterialIcons name={activeTab === 'session' ? 'qr-code-scanner' : 'inventory-2'} size={34} color={colors.primary.main} /><Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{activeTab === 'session' ? 'Aún no has agregado productos' : 'La orden no tiene productos pendientes'}</Text><Text style={[styles.emptyText, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Escanea el primer producto para comenzar.' : 'Todos los productos ya fueron recibidos.'}</Text></View>}
        ListFooterComponent={activeTab === 'pending' && pendingItems.length > visibleCount ? <Button title={`Ver ${Math.min(PAGE_SIZE, pendingItems.length - visibleCount)} productos más`} variant="outline" onPress={() => setVisibleCount((value) => value + PAGE_SIZE)} /> : null}
      />
      <View style={[styles.footer, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <View style={styles.footerSummary}><Text style={[styles.footerTotal, { color: colors.text.primary }]}>{store.entryItems.length} productos · {sessionUnits} unidades</Text>{remaining !== null ? <Text style={[styles.footerMeta, { color: colors.text.secondary }]}>{remaining} unidades pendientes en la OC</Text> : null}</View>
        <View style={styles.footerButtons}><Button title={store.entryItems.length ? 'Escanear otro' : 'Escanear producto'} variant={store.entryItems.length ? 'outline' : 'primary'} onPress={openScanner} style={styles.flexButton} />{store.entryItems.length ? <Button title="Revisar entrada" onPress={() => store.setUiStage('entry_review')} style={styles.flexButton} /> : null}</View>
      </View>
    </View>
  );
}

type Colors = ReturnType<typeof getColors>;
type Product = EntryItem['product'];

function WorkspaceHeader({ colors, title, detail, percentage, sessionUnits, remaining, onBack }: { colors: Colors; title: string; detail: string; percentage: number | null; sessionUnits: number; remaining: number | null; onBack: () => void }) {
  return <View style={[styles.header, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><View style={styles.headerRow}><Pressable onPress={onBack} style={[styles.iconButton, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="arrow-back" size={22} color={colors.text.primary} /></Pressable><View style={styles.copy}><Text style={[styles.headerTitle, { color: colors.text.primary }]}>{title}</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>{detail}</Text></View>{percentage !== null ? <View style={[styles.pill, { backgroundColor: `${colors.primary.main}16` }]}><Text style={[styles.pillText, { color: colors.primary.main }]}>{Math.round(percentage)}%</Text></View> : null}</View>{percentage !== null ? <><View style={[styles.track, { backgroundColor: colors.divider }]}><View style={[styles.fill, { backgroundColor: colors.primary.main, width: `${percentage}%` }]} /></View><View style={styles.labels}><Text style={[styles.meta, { color: colors.text.secondary }]}>{sessionUnits} recibidas ahora</Text><Text style={[styles.strongMeta, { color: colors.text.primary }]}>{remaining} pendientes</Text></View></> : <Text style={[styles.manualHint, { color: colors.text.secondary }]}>Recibe productos en la bodega seleccionada</Text>}</View>;
}

function SessionCard({ item, colors, onDecrease, onIncrease, onRemove }: { item: EntryItem; colors: Colors; onDecrease: () => void; onIncrease: () => void; onRemove: () => void }) {
  return <View style={[styles.itemCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><View style={styles.itemRow}><View style={[styles.itemIcon, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="inventory-2" size={21} color={colors.primary.main} /></View><View style={styles.copy}><Text style={[styles.itemName, { color: colors.text.primary }]}>{item.product.name}</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>SKU: {item.product.sku || '—'}</Text></View><Pressable onPress={onRemove} style={styles.iconButton}><MaterialIcons name="delete-outline" size={22} color={colors.error.main} /></Pressable></View><View style={styles.editor}><Text style={[styles.meta, { color: colors.text.secondary }]}>Cantidad recibida</Text><View style={styles.controls}><Pressable disabled={item.quantity <= 1} onPress={onDecrease} style={[styles.quantityButton, { backgroundColor: colors.surface.muted }, item.quantity <= 1 && styles.disabled]}><MaterialIcons name="remove" size={20} color={colors.primary.main} /></Pressable><Text style={[styles.quantity, { color: colors.text.primary }]}>{item.quantity}</Text><Pressable onPress={onIncrease} style={[styles.quantityButton, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="add" size={20} color={colors.primary.main} /></Pressable></View></View></View>;
}

function PendingCard({ item, colors, expanded, onPress }: { item: SelectedPurchaseOrderProgressItem; colors: Colors; expanded: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.itemCard, { backgroundColor: colors.background.paper, borderColor: expanded ? colors.primary.main : colors.divider }]}><View style={styles.itemRow}><View style={[styles.itemIcon, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="inventory-2" size={21} color={colors.primary.main} /></View><View style={styles.copy}><Text style={[styles.itemName, { color: colors.text.primary }]}>{item.item.product?.name || 'Producto'}</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>SKU: {item.item.product?.sku || '—'} · Pendiente {item.pending}</Text></View><MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={23} color={colors.text.secondary} /></View>{expanded ? <View style={styles.metrics}><Metric label="Orden" value={item.orderQuantity} colors={colors} /><Metric label="Ya recibido" value={item.registered} colors={colors} /><Metric label="Esta entrada" value={item.sessionScanned} colors={colors} primary /></View> : null}</Pressable>;
}

function Metric({ label, value, colors, primary }: { label: string; value: number; colors: Colors; primary?: boolean }) {
  return <View style={[styles.metric, { backgroundColor: colors.background.default }]}><Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{label}</Text><Text style={[styles.metricValue, { color: primary ? colors.primary.main : colors.text.primary }]}>{value}</Text></View>;
}

function ProductReview({ colors, bottomInset, product, barcode, warehouse, pending, alreadyAdded, quantity, error, onQuantityChange, onCancel, onAdd, onAddAndScan }: { colors: Colors; bottomInset: number; product: Product; barcode: string; warehouse: string; pending: number | null; alreadyAdded: number; quantity: number; error: string | null; onQuantityChange: (value: number) => void; onCancel: () => void; onAdd: () => void; onAddAndScan: () => void }) {
  const maximum = pending ?? MAX_MANUAL_QUANTITY;
  const valid = quantity > 0 && quantity <= maximum;
  return <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background.default }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={[styles.reviewContent, { paddingBottom: 230 + bottomInset }]} keyboardShouldPersistTaps="handled"><View style={styles.reviewHeader}><Pressable onPress={onCancel} style={[styles.iconButton, { backgroundColor: colors.background.paper }]}><MaterialIcons name="arrow-back" size={22} color={colors.text.primary} /></Pressable><View style={styles.copy}><Text style={[styles.reviewTitle, { color: colors.text.primary }]}>Verificar producto</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>Confirma la cantidad antes de agregar</Text></View></View><View style={[styles.reviewCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><Text style={[styles.found, { color: colors.success.main }]}>PRODUCTO ENCONTRADO</Text><Text style={[styles.productName, { color: colors.text.primary }]}>{product.name}</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>SKU: {product.sku || '—'} · {barcode}</Text><View style={[styles.warehouse, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="warehouse" size={20} color={colors.primary.main} /><Text style={[styles.warehouseText, { color: colors.text.primary }]}>{warehouse}</Text></View><View style={styles.metrics}>{pending !== null ? <Metric label="Pendiente" value={pending} colors={colors} primary /> : null}<Metric label="Ya agregado" value={alreadyAdded} colors={colors} /></View><Text style={[styles.quantityLabel, { color: colors.text.primary }]}>Cantidad para recibir</Text><View style={styles.largeControls}><Pressable disabled={quantity <= 1} onPress={() => onQuantityChange(Math.max(1, quantity - 1))} style={[styles.largeButton, { backgroundColor: colors.primary.main }, quantity <= 1 && styles.disabled]}><MaterialIcons name="remove" size={25} color={colors.primary.contrastText} /></Pressable><Input value={String(quantity)} onChangeText={(text) => { const value = Number.parseInt(text, 10); onQuantityChange(Number.isFinite(value) ? Math.min(Math.max(value, 0), maximum) : 0); }} keyboardType="number-pad" containerStyle={styles.quantityInputContainer} style={styles.quantityInput} /><Pressable disabled={quantity >= maximum} onPress={() => onQuantityChange(Math.min(maximum, quantity + 1))} style={[styles.largeButton, { backgroundColor: colors.primary.main }, quantity >= maximum && styles.disabled]}><MaterialIcons name="add" size={25} color={colors.primary.contrastText} /></Pressable></View><View style={styles.quickRow}><Pressable onPress={() => onQuantityChange(1)} style={[styles.quick, { borderColor: colors.divider }]}><Text style={{ color: colors.primary.main, fontWeight: '700' }}>1 unidad</Text></Pressable>{pending !== null ? <Pressable onPress={() => onQuantityChange(pending)} style={[styles.quick, { borderColor: colors.divider }]}><Text style={{ color: colors.primary.main, fontWeight: '700' }}>Todo ({pending})</Text></Pressable> : null}</View>{error ? <Text style={[styles.reviewError, { color: colors.error.main }]}>{error}</Text> : null}</View></ScrollView><View style={[styles.footer, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(bottomInset, Spacing.md) }]}><Button title="Agregar y escanear siguiente" onPress={onAddAndScan} disabled={!valid} /><Button title="Agregar y volver al resumen" variant="outline" onPress={onAdd} disabled={!valid} /><Button title="Cancelar" variant="ghost" onPress={onCancel} /></View></KeyboardAvoidingView>;
}

function EntryReview({ colors, bottomInset, type, orderNumber, supplier, warehouse, items, partial, loading, error, onBack, onFinalize }: { colors: Colors; bottomInset: number; type: string; orderNumber: string | null; supplier: string | null; warehouse: string; items: EntryItem[]; partial: boolean; loading: boolean; error: string | null; onBack: () => void; onFinalize: () => void }) {
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  return <View style={[styles.container, { backgroundColor: colors.background.default }]}><FlatList data={items} keyExtractor={(item) => item.product.id} contentContainerStyle={[styles.reviewContent, { paddingBottom: 170 + bottomInset }]} ListHeaderComponent={<View><View style={styles.reviewHeader}><Pressable onPress={onBack} style={[styles.iconButton, { backgroundColor: colors.background.paper }]}><MaterialIcons name="arrow-back" size={22} color={colors.text.primary} /></Pressable><View style={styles.copy}><Text style={[styles.reviewTitle, { color: colors.text.primary }]}>Revisar entrada</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>{type}{orderNumber ? ` · OC #${orderNumber}` : ''}</Text></View></View><View style={[styles.reviewCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><Text style={[styles.itemName, { color: colors.text.primary }]}>{items.length} productos · {units} unidades</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>{supplier ? `${supplier} · ` : ''}{warehouse}</Text>{orderNumber ? <Text style={[styles.partial, { color: partial ? colors.warning.main : colors.success.main }]}>{partial ? 'La orden conservará cantidades pendientes' : 'Esta entrada completa la orden'}</Text> : null}</View>{error ? <View style={[styles.errorBanner, { backgroundColor: `${colors.error.main}14`, borderColor: colors.error.main }]}><MaterialIcons name="error-outline" size={20} color={colors.error.main} /><Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text></View> : null}<Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Productos a registrar</Text></View>} renderItem={({ item }) => <View style={[styles.reviewItem, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><View style={styles.copy}><Text style={[styles.itemName, { color: colors.text.primary }]}>{item.product.name}</Text><Text style={[styles.meta, { color: colors.text.secondary }]}>SKU: {item.product.sku || '—'}</Text></View><Text style={[styles.reviewQuantity, { color: colors.primary.main }]}>{item.quantity}</Text></View>} /><View style={[styles.footer, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(bottomInset, Spacing.md) }]}><Button title={`Registrar entrada · ${units} unidades`} onPress={onFinalize} loading={loading} disabled={loading} /><Button title="Seguir editando" variant="ghost" onPress={onBack} disabled={loading} /></View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, listContent: { padding: Spacing.lg }, header: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.lg, padding: Spacing.lg, ...Shadows.card }, headerRow: { alignItems: 'center', flexDirection: 'row' }, iconButton: { alignItems: 'center', borderRadius: Radius.control, height: 44, justifyContent: 'center', width: 44 }, copy: { flex: 1, marginLeft: Spacing.md }, headerTitle: { fontSize: 17, fontWeight: '800' }, meta: { fontSize: 12, lineHeight: 17, marginTop: 2 }, pill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }, pillText: { fontSize: 13, fontWeight: '800' }, track: { borderRadius: 4, height: 8, marginTop: Spacing.lg, overflow: 'hidden' }, fill: { height: '100%' }, labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm }, strongMeta: { fontSize: 12, fontWeight: '700' }, manualHint: { fontSize: 12, marginTop: Spacing.md }, errorBanner: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, padding: Spacing.md }, errorText: { flex: 1, fontSize: 13, fontWeight: '600' }, hint: { fontSize: 12, marginBottom: Spacing.sm, marginTop: Spacing.sm, textAlign: 'center' }, empty: { alignItems: 'center', borderRadius: Radius.card, borderWidth: 1, gap: Spacing.sm, padding: Spacing.xxl }, emptyTitle: { fontSize: 16, fontWeight: '800' }, emptyText: { fontSize: 13, textAlign: 'center' }, itemCard: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.md, padding: Spacing.md }, itemRow: { alignItems: 'center', flexDirection: 'row' }, itemIcon: { alignItems: 'center', borderRadius: Radius.control, height: 42, justifyContent: 'center', width: 42 }, itemName: { fontSize: 14, fontWeight: '800' }, editor: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md }, controls: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md }, quantityButton: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 }, quantity: { fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center' }, disabled: { opacity: 0.4 }, metrics: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }, metric: { alignItems: 'center', borderRadius: 10, flex: 1, padding: Spacing.sm }, metricLabel: { fontSize: 10, fontWeight: '600' }, metricValue: { fontSize: 18, fontWeight: '800', marginTop: 2 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, gap: Spacing.sm, left: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, position: 'absolute', right: 0, ...Shadows.floating }, footerSummary: { alignItems: 'center' }, footerTotal: { fontSize: 14, fontWeight: '800' }, footerMeta: { fontSize: 11, marginTop: 2 }, footerButtons: { flexDirection: 'row', gap: Spacing.sm }, flexButton: { flex: 1, paddingHorizontal: Spacing.sm }, reviewContent: { padding: Spacing.lg }, reviewHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: Spacing.lg }, reviewTitle: { ...Typography.title, fontSize: 25, lineHeight: 30 }, reviewCard: { borderRadius: Radius.card, borderWidth: 1, gap: Spacing.md, padding: Spacing.lg, ...Shadows.card }, found: { fontSize: 11, fontWeight: '800' }, productName: { fontSize: 20, fontWeight: '800' }, warehouse: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', padding: Spacing.md }, warehouseText: { flex: 1, fontSize: 14, fontWeight: '700', marginLeft: Spacing.sm }, quantityLabel: { fontSize: 14, fontWeight: '800', textAlign: 'center' }, largeControls: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md }, largeButton: { alignItems: 'center', borderRadius: Radius.control, height: 52, justifyContent: 'center', width: 52 }, quantityInputContainer: { flex: 1, marginBottom: 0 }, quantityInput: { fontSize: 21, fontWeight: '800', textAlign: 'center' }, quickRow: { flexDirection: 'row', gap: Spacing.sm }, quick: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44 }, reviewError: { fontSize: 12, fontWeight: '600', textAlign: 'center' }, partial: { fontSize: 12, fontWeight: '700', marginTop: Spacing.sm }, sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: Spacing.md, marginTop: Spacing.lg }, reviewItem: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', marginBottom: Spacing.sm, padding: Spacing.md }, reviewQuantity: { fontSize: 20, fontWeight: '800', marginLeft: Spacing.md }, success: { flex: 1, justifyContent: 'center', padding: Spacing.xl }, successNote: { fontSize: 13, textAlign: 'center' }, successActions: { gap: Spacing.sm, marginTop: Spacing.xl },
});
