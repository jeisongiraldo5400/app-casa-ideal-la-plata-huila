import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import {
  type ExitItem,
  type FinalizeExitSummary,
  type SelectedDeliveryOrderProgressItem,
  useExitsStore,
} from '@/components/exits/infrastructure/store/exitsStore';
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
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScanningUiStage = 'idle' | 'product_review' | 'exit_review' | 'success';
type DashboardTab = 'session' | 'pending';
type DashboardRow =
  | { kind: 'session'; key: string; item: ExitItem; index: number }
  | { kind: 'pending'; key: string; progress: SelectedDeliveryOrderProgressItem };

const PENDING_PAGE_SIZE = 10;

export function ExitScanningWorkspace() {
  const store = useExitsStore();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [stage, setStage] = useState<ScanningUiStage>('idle');
  const [showScanner, setShowScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('session');
  const [visiblePendingCount, setVisiblePendingCount] = useState(PENDING_PAGE_SIZE);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<FinalizeExitSummary | null>(null);
  const scanGuardRef = useRef(false);
  const finalizeGuardRef = useRef(false);

  const progress = store.getSelectedDeliveryOrderProgress();
  const order = store.selectedDeliveryOrder;
  const pendingAtStart = Math.max(
    (progress?.totalRequired || 0) - (progress?.totalRegistered || 0),
    0,
  );
  const sessionUnits = store.exitItems.reduce((sum, item) => sum + item.quantity, 0);
  const remainingUnits = Math.max(pendingAtStart - (progress?.totalScanned || 0), 0);
  const sessionProgress = pendingAtStart > 0
    ? Math.min(((progress?.totalScanned || 0) / pendingAtStart) * 100, 100)
    : 100;

  const sessionRows = useMemo<DashboardRow[]>(
    () => store.exitItems.map((item, index) => ({
      kind: 'session',
      key: `${item.product.id}-${item.warehouseId || index}`,
      item,
      index,
    })),
    [store.exitItems],
  );
  const pendingRows = useMemo<DashboardRow[]>(
    () => (progress?.items || [])
      .filter((item) => item.pending > 0)
      .slice(0, visiblePendingCount)
      .map((item) => ({ kind: 'pending', key: item.item.id, progress: item })),
    [progress?.items, visiblePendingCount],
  );
  const pendingProductCount = (progress?.items || []).filter((item) => item.pending > 0).length;
  const rows = activeTab === 'session' ? sessionRows : pendingRows;
  const warehouseNames = useMemo(
    () => new Map((order?.items || []).map((item) => [item.warehouse_id, item.warehouse_name])),
    [order?.items],
  );

  const openScanner = () => {
    store.clearError();
    setReviewError(null);
    setShowScanner(true);
  };

  const handleScan = async (barcode: string) => {
    if (scanGuardRef.current) return;
    scanGuardRef.current = true;
    try {
      await store.scanBarcode(barcode.trim());
      const current = useExitsStore.getState();
      if (current.currentProduct) {
        setStage('product_review');
        setShowScanner(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        throw new Error(current.error || 'No fue posible validar el producto escaneado');
      }
    } finally {
      scanGuardRef.current = false;
    }
  };

  const addCurrentProduct = async (scanNext: boolean) => {
    const current = useExitsStore.getState();
    if (!current.currentProduct) return;

    const result = await current.addProductToExit(
      current.currentProduct,
      current.currentQuantity,
      current.currentScannedBarcode || '',
    );
    if (!result.ok) {
      setReviewError(result.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      return;
    }

    setReviewError(null);
    setStage('idle');
    setActiveTab('session');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (scanNext) setShowScanner(true);
  };

  const cancelProductReview = () => {
    store.resetCurrentScan();
    store.clearError();
    setReviewError(null);
    setStage('idle');
  };

  const returnToConfirmation = () => {
    if (!store.exitItems.length) {
      store.goBackToSetup();
      return;
    }
    Alert.alert(
      'Volver a confirmación',
      'Se descartarán los productos agregados en esta salida.',
      [
        { text: 'Continuar escaneando', style: 'cancel' },
        { text: 'Descartar y volver', style: 'destructive', onPress: store.goBackToSetup },
      ],
    );
  };

  const removeSessionItem = (row: Extract<DashboardRow, { kind: 'session' }>) => {
    Alert.alert('Quitar producto', `¿Quitar ${row.item.product.name} de esta salida?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => store.removeProductFromExit(row.index) },
    ]);
  };

  const finalize = async () => {
    if (!store.exitItems.length || finalizeGuardRef.current || store.loading) return;
    if (!user) {
      setReviewError('Usuario no autenticado');
      return;
    }

    finalizeGuardRef.current = true;
    setReviewError(null);
    try {
      const result = await useExitsStore.getState().finalizeExit(user.id);
      if (!result.ok) {
        setReviewError(result.error?.message || String(result.error) || 'No fue posible registrar la salida');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        return;
      }
      setSuccessSummary(result.summary);
      setStage('success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } finally {
      finalizeGuardRef.current = false;
    }
  };

  if (showScanner) {
    return (
      <BarcodeScanner
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
        title="Escanear producto de la salida"
        contextLabel={order ? `Orden #${order.order_number || order.id.slice(0, 8)} · ${remainingUnits} unidades pendientes` : undefined}
        instruction="Ubica el código dentro del recuadro"
      />
    );
  }

  if (stage === 'success' && successSummary) {
    return (
      <View style={[styles.successScreen, { backgroundColor: colors.background.default }]}>
        <ScreenState
          title="Salida registrada correctamente"
          description={`Orden #${successSummary.orderNumber} · ${successSummary.productCount} productos · ${successSummary.totalUnits} unidades`}
          icon="check-circle"
        />
        <View style={[styles.successStatus, { backgroundColor: successSummary.orderCompleted ? `${colors.success.main}18` : colors.surface.muted }]}>
          <MaterialIcons name={successSummary.orderCompleted ? 'task-alt' : 'pending-actions'} size={22} color={successSummary.orderCompleted ? colors.success.main : colors.primary.main} />
          <Text style={[styles.successStatusText, { color: colors.text.primary }]}>{successSummary.orderCompleted ? 'La orden quedó completamente entregada.' : 'La orden conserva cantidades pendientes.'}</Text>
        </View>
        <View style={styles.successActions}>
          <Button title="Volver a Mis órdenes" onPress={() => {
            store.reset();
            router.replace('/(tabs)/my-orders' as never);
          }} />
          <Button title="Registrar otra salida" variant="outline" onPress={() => store.reset()} />
        </View>
      </View>
    );
  }

  if (stage === 'product_review' && store.currentProduct) {
    return (
      <ProductReviewScreen
        colors={colors}
        bottomInset={insets.bottom}
        productName={store.currentProduct.name}
        sku={store.currentProduct.sku || null}
        barcode={store.currentScannedBarcode || store.currentProduct.barcode || ''}
        warehouseName={order?.items.find((item) => item.id === store.targetOrderItemId)?.warehouse_name || 'Bodega de la orden'}
        pending={store.currentAvailableStock}
        alreadyInSession={store.exitItems.find((item) => item.product.id === store.currentProduct?.id && item.warehouseId === store.warehouseId)?.quantity || 0}
        quantity={store.currentQuantity}
        error={reviewError || store.error}
        onQuantityChange={store.setQuantity}
        onCancel={cancelProductReview}
        onAdd={() => void addCurrentProduct(false)}
        onAddAndScan={() => void addCurrentProduct(true)}
      />
    );
  }

  if (stage === 'exit_review') {
    return (
      <ExitReview
        colors={colors}
        insetsBottom={insets.bottom}
        orderNumber={order?.order_number || order?.id.slice(0, 8) || '—'}
        recipient={order?.customer_name || order?.assigned_to_user_name || 'Destinatario'}
        items={store.exitItems}
        warehouseNames={warehouseNames}
        observation={store.deliveryObservations}
        partial={remainingUnits > 0}
        loading={store.loading}
        error={reviewError}
        onObservationChange={store.setDeliveryObservations}
        onBack={() => {
          setReviewError(null);
          setStage('idle');
        }}
        onFinalize={() => void finalize()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => item.kind === 'session'
          ? (
            <SessionItemCard
              row={item}
              colors={colors}
              warehouseName={warehouseNames.get(item.item.warehouseId || '') || 'Bodega de la orden'}
              onDecrease={() => store.updateProductQuantity(item.index, item.item.quantity - 1)}
              onIncrease={() => store.updateProductQuantity(item.index, item.item.quantity + 1)}
              onRemove={() => removeSessionItem(item)}
            />
          )
          : (
            <PendingItemCard
              row={item.progress}
              colors={colors}
              expanded={expandedItemId === item.progress.item.id}
              onPress={() => setExpandedItemId((current) => current === item.progress.item.id ? null : item.progress.item.id)}
            />
          )}
        contentContainerStyle={[styles.listContent, { paddingBottom: 150 + insets.bottom }]}
        ListHeaderComponent={
          <View>
            <SessionHeader
              colors={colors}
              orderNumber={order?.order_number || order?.id.slice(0, 8) || '—'}
              recipient={order?.customer_name || order?.assigned_to_user_name || 'Destinatario'}
              sessionUnits={progress?.totalScanned || 0}
              pendingAtStart={pendingAtStart}
              remainingUnits={remainingUnits}
              percentage={sessionProgress}
              onBack={returnToConfirmation}
            />
            {store.error ? (
              <View style={[styles.errorBanner, { backgroundColor: `${colors.error.main}14`, borderColor: colors.error.main }]}>
                <MaterialIcons name="error-outline" size={20} color={colors.error.main} />
                <Text style={[styles.errorBannerText, { color: colors.error.main }]}>{store.error}</Text>
                <Pressable onPress={openScanner} accessibilityRole="button">
                  <Text style={{ color: colors.primary.main, fontWeight: '800' }}>Reintentar</Text>
                </Pressable>
              </View>
            ) : null}
            <SegmentedControl
              value={activeTab}
              onChange={(value) => setActiveTab(value as DashboardTab)}
              items={[
                { value: 'session', label: 'Esta salida', icon: 'shopping-cart', badge: store.exitItems.length },
                { value: 'pending', label: 'Pendientes', icon: 'inventory-2', badge: pendingProductCount },
              ]}
            />
            <Text style={[styles.sectionHint, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Productos preparados para registrar' : 'Estado completo de la orden'}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <MaterialIcons name={activeTab === 'session' ? 'qr-code-scanner' : 'inventory-2'} size={34} color={colors.primary.main} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{activeTab === 'session' ? 'Aún no has agregado productos' : 'No hay productos en la orden'}</Text>
            <Text style={[styles.emptyText, { color: colors.text.secondary }]}>{activeTab === 'session' ? 'Escanea el primer producto o consulta lo que falta en la orden.' : progress ? 'Todos los productos de la orden están completos.' : 'No se encontró información de progreso.'}</Text>
            {activeTab === 'session' && pendingProductCount > 0 ? (
              <Button
                title={`Ver productos pendientes (${pendingProductCount})`}
                variant="outline"
                onPress={() => setActiveTab('pending')}
                style={styles.emptyAction}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={activeTab === 'pending' && pendingProductCount > visiblePendingCount ? (
          <Button
            title={`Ver ${Math.min(PENDING_PAGE_SIZE, pendingProductCount - visiblePendingCount)} productos más`}
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
            <Button title="Revisar salida" onPress={() => setStage('exit_review')} style={styles.footerButton} />
          ) : pendingProductCount > 0 ? (
            <Button title={`Ver pendientes (${pendingProductCount})`} variant="outline" onPress={() => setActiveTab('pending')} style={styles.footerButton} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

type Colors = ReturnType<typeof getColors>;

function SessionHeader({ colors, orderNumber, recipient, sessionUnits, pendingAtStart, remainingUnits, percentage, onBack }: {
  colors: Colors; orderNumber: string; recipient: string; sessionUnits: number; pendingAtStart: number; remainingUnits: number; percentage: number; onBack: () => void;
}) {
  return (
    <View style={[styles.sessionHeader, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <View style={styles.sessionTopRow}>
        <Pressable onPress={onBack} style={[styles.backButton, { backgroundColor: colors.surface.muted }]} accessibilityRole="button" accessibilityLabel="Volver a confirmación">
          <MaterialIcons name="arrow-back" size={22} color={colors.text.primary} />
        </Pressable>
        <View style={styles.sessionTitleArea}>
          <Text style={[styles.sessionOrder, { color: colors.text.primary }]}>Orden #{orderNumber}</Text>
          <Text style={[styles.sessionRecipient, { color: colors.text.secondary }]} numberOfLines={1}>{recipient}</Text>
        </View>
        <View style={[styles.progressPill, { backgroundColor: `${colors.primary.main}16` }]}>
          <Text style={[styles.progressPillText, { color: colors.primary.main }]}>{Math.round(percentage)}%</Text>
        </View>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.divider }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.primary.main, width: `${percentage}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>{sessionUnits} de {pendingAtStart} escaneadas</Text>
        <Text style={[styles.progressLabelStrong, { color: colors.text.primary }]}>{remainingUnits} pendientes</Text>
      </View>
    </View>
  );
}

function SessionItemCard({ row, colors, warehouseName, onDecrease, onIncrease, onRemove }: {
  row: Extract<DashboardRow, { kind: 'session' }>; colors: Colors; warehouseName: string; onDecrease: () => void; onIncrease: () => void; onRemove: () => void;
}) {
  return (
    <View style={[styles.itemCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <View style={styles.itemMain}>
        <View style={[styles.itemIcon, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="inventory-2" size={21} color={colors.primary.main} /></View>
        <View style={styles.itemCopy}>
          <Text style={[styles.itemName, { color: colors.text.primary }]} numberOfLines={2}>{row.item.product.name}</Text>
          <Text style={[styles.itemMeta, { color: colors.text.secondary }]}>SKU: {row.item.product.sku || '—'} · {warehouseName}</Text>
        </View>
        <Pressable onPress={onRemove} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Quitar ${row.item.product.name}`}>
          <MaterialIcons name="delete-outline" size={22} color={colors.error.main} />
        </Pressable>
      </View>
      <View style={styles.quantityEditor}>
        <Text style={[styles.quantityCaption, { color: colors.text.secondary }]}>Cantidad de esta salida</Text>
        <View style={styles.quantityControls}>
          <Pressable disabled={row.item.quantity <= 1} onPress={onDecrease} style={[styles.smallQuantityButton, { backgroundColor: colors.surface.muted }, row.item.quantity <= 1 && styles.disabled]}><MaterialIcons name="remove" size={20} color={colors.primary.main} /></Pressable>
          <Text style={[styles.sessionQuantity, { color: colors.text.primary }]}>{row.item.quantity}</Text>
          <Pressable disabled={!row.item.availableStock} onPress={onIncrease} style={[styles.smallQuantityButton, { backgroundColor: colors.surface.muted }, !row.item.availableStock && styles.disabled]}><MaterialIcons name="add" size={20} color={colors.primary.main} /></Pressable>
        </View>
      </View>
    </View>
  );
}

function PendingItemCard({ row, colors, expanded, onPress }: { row: SelectedDeliveryOrderProgressItem; colors: Colors; expanded: boolean; onPress: () => void }) {
  const tone = row.isComplete ? colors.success.main : row.sessionScanned > 0 ? colors.warning.main : colors.text.secondary;
  return (
    <Pressable onPress={onPress} style={[styles.itemCard, { backgroundColor: colors.background.paper, borderColor: expanded ? tone : colors.divider }]} accessibilityRole="button" accessibilityState={{ expanded }}>
      <View style={styles.itemMain}>
        <View style={[styles.itemIcon, { backgroundColor: `${tone}18` }]}><MaterialIcons name={row.isComplete ? 'check-circle' : row.sessionScanned ? 'pending' : 'inventory-2'} size={21} color={tone} /></View>
        <View style={styles.itemCopy}>
          <Text style={[styles.itemName, { color: colors.text.primary }]} numberOfLines={2}>{row.item.product_name}</Text>
          <Text style={[styles.itemMeta, { color: colors.text.secondary }]}>{row.item.warehouse_name} · Pendiente {row.pending}</Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={23} color={colors.text.secondary} />
      </View>
      {expanded ? (
        <View style={styles.detailMetrics}>
          <Metric label="Orden" value={row.orderQuantity} colors={colors} />
          <Metric label="Entregado" value={row.registered} colors={colors} />
          <Metric label="Esta salida" value={row.sessionScanned} colors={colors} primary />
        </View>
      ) : null}
    </Pressable>
  );
}

function Metric({ label, value, colors, primary }: { label: string; value: number; colors: Colors; primary?: boolean }) {
  return <View style={[styles.metric, { backgroundColor: colors.background.default }]}><Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{label}</Text><Text style={[styles.metricValue, { color: primary ? colors.primary.main : colors.text.primary }]}>{value}</Text></View>;
}

function ProductReviewScreen({ colors, bottomInset, productName, sku, barcode, warehouseName, pending, alreadyInSession, quantity, error, onQuantityChange, onCancel, onAdd, onAddAndScan }: {
  colors: Colors; bottomInset: number; productName: string; sku: string | null; barcode: string; warehouseName: string; pending: number; alreadyInSession: number; quantity: number; error: string | null; onQuantityChange: (quantity: number) => void; onCancel: () => void; onAdd: () => void; onAddAndScan: () => void;
}) {
  const valid = quantity > 0 && quantity <= pending;
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.productReviewContent, { paddingBottom: 230 + bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.productReviewHeader}>
          <Pressable onPress={onCancel} style={[styles.backButton, { backgroundColor: colors.background.paper }]} accessibilityRole="button" accessibilityLabel="Cancelar revisión del producto">
            <MaterialIcons name="arrow-back" size={22} color={colors.text.primary} />
          </Pressable>
          <View style={styles.itemCopy}>
            <Text style={[styles.reviewTitle, { color: colors.text.primary }]}>Verificar producto</Text>
            <Text style={[styles.itemMeta, { color: colors.text.secondary }]}>Confirma la cantidad antes de agregar</Text>
          </View>
        </View>
        <View style={[styles.productReviewCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}> 
          <View style={styles.productHeading}>
            <View style={[styles.productIcon, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="check" size={27} color={colors.success.main} /></View>
            <View style={styles.itemCopy}><Text style={[styles.productReady, { color: colors.success.main }]}>Producto encontrado</Text><Text style={[styles.productName, { color: colors.text.primary }]}>{productName}</Text><Text style={[styles.itemMeta, { color: colors.text.secondary }]}>SKU: {sku || '—'} · {barcode}</Text></View>
          </View>
          <View style={[styles.warehouseRow, { backgroundColor: colors.surface.muted }]}><MaterialIcons name="warehouse" size={20} color={colors.primary.main} /><View style={styles.itemCopy}><Text style={[styles.metricLabel, { color: colors.text.secondary }]}>Bodega automática</Text><Text style={[styles.warehouseName, { color: colors.text.primary }]}>{warehouseName}</Text></View></View>
          <View style={styles.reviewMetrics}><Metric label="Pendiente" value={pending} colors={colors} primary /><Metric label="Ya agregado" value={alreadyInSession} colors={colors} /></View>
          <Text style={[styles.quantityTitle, { color: colors.text.primary }]}>Cantidad para agregar</Text>
          <View style={styles.largeQuantityRow}>
            <Pressable disabled={quantity <= 1} onPress={() => onQuantityChange(Math.max(1, quantity - 1))} style={[styles.largeQuantityButton, { backgroundColor: colors.primary.main }, quantity <= 1 && styles.disabled]}><MaterialIcons name="remove" size={25} color={colors.primary.contrastText} /></Pressable>
            <Input value={String(quantity)} onChangeText={(text) => { const next = Number.parseInt(text, 10); onQuantityChange(Number.isFinite(next) ? Math.min(Math.max(next, 0), pending) : 0); }} keyboardType="number-pad" containerStyle={styles.quantityInputContainer} style={styles.quantityInput} />
            <Pressable disabled={quantity >= pending} onPress={() => onQuantityChange(Math.min(pending, quantity + 1))} style={[styles.largeQuantityButton, { backgroundColor: colors.primary.main }, quantity >= pending && styles.disabled]}><MaterialIcons name="add" size={25} color={colors.primary.contrastText} /></Pressable>
          </View>
          <View style={styles.quickQuantities}><Pressable onPress={() => onQuantityChange(1)} style={[styles.quickButton, { borderColor: colors.divider }]}><Text style={{ color: colors.primary.main, fontWeight: '700' }}>1 unidad</Text></Pressable><Pressable onPress={() => onQuantityChange(pending)} style={[styles.quickButton, { borderColor: colors.divider }]}><Text style={{ color: colors.primary.main, fontWeight: '700' }}>Todo ({pending})</Text></Pressable></View>
          {error ? <Text style={[styles.reviewError, { color: colors.error.main }]}>{error}</Text> : null}
        </View>
      </ScrollView>
      <View style={[styles.stickyFooter, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(bottomInset, Spacing.md) }]}> 
        <Button title="Agregar y escanear siguiente" onPress={onAddAndScan} disabled={!valid} />
        <Button title="Agregar y volver al resumen" variant="outline" onPress={onAdd} disabled={!valid} />
        <Button title="Cancelar" variant="ghost" onPress={onCancel} />
      </View>
    </KeyboardAvoidingView>
  );
}

function ExitReview({ colors, insetsBottom, orderNumber, recipient, items, warehouseNames, observation, partial, loading, error, onObservationChange, onBack, onFinalize }: {
  colors: Colors; insetsBottom: number; orderNumber: string; recipient: string; items: ExitItem[]; warehouseNames: Map<string, string>; observation: string; partial: boolean; loading: boolean; error: string | null; onObservationChange: (value: string) => void; onBack: () => void; onFinalize: () => void;
}) {
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.product.id}-${item.warehouseId || index}`}
        contentContainerStyle={[styles.reviewList, { paddingBottom: 170 + insetsBottom }]}
        ListHeaderComponent={<View><View style={styles.reviewHeader}><Pressable onPress={onBack} style={[styles.backButton, { backgroundColor: colors.background.paper }]}><MaterialIcons name="arrow-back" size={22} color={colors.text.primary} /></Pressable><View style={styles.itemCopy}><Text style={[styles.reviewTitle, { color: colors.text.primary }]}>Revisar salida</Text><Text style={[styles.itemMeta, { color: colors.text.secondary }]}>Orden #{orderNumber} · {recipient}</Text></View></View><View style={[styles.reviewSummary, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><Text style={[styles.reviewSummaryTotal, { color: colors.text.primary }]}>{items.length} productos · {units} unidades</Text><Text style={[styles.reviewSummaryStatus, { color: partial ? colors.warning.main : colors.success.main }]}>{partial ? 'Esta salida dejará cantidades pendientes' : 'Esta salida completa la orden'}</Text></View><TextInput multiline value={observation} onChangeText={onObservationChange} placeholder="Observación opcional" placeholderTextColor={colors.text.secondary} style={[styles.observationInput, { backgroundColor: colors.background.paper, borderColor: colors.divider, color: colors.text.primary }]} />{error ? <View style={[styles.errorBanner, { backgroundColor: `${colors.error.main}14`, borderColor: colors.error.main }]}><MaterialIcons name="error-outline" size={20} color={colors.error.main} /><Text style={[styles.errorBannerText, { color: colors.error.main }]}>{error}</Text></View> : null}<Text style={[styles.reviewSectionTitle, { color: colors.text.primary }]}>Productos a registrar</Text></View>}
        renderItem={({ item }) => <View style={[styles.reviewItem, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><View style={styles.itemCopy}><Text style={[styles.itemName, { color: colors.text.primary }]}>{item.product.name}</Text><Text style={[styles.itemMeta, { color: colors.text.secondary }]}>SKU: {item.product.sku || '—'} · {warehouseNames.get(item.warehouseId || '') || 'Bodega de la orden'}</Text></View><Text style={[styles.reviewItemQuantity, { color: colors.primary.main }]}>{item.quantity}</Text></View>}
      />
      <View style={[styles.stickyFooter, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(insetsBottom, Spacing.md) }]}><Button title={`Registrar salida · ${units} unidades`} onPress={onFinalize} loading={loading} disabled={loading} /><Button title="Seguir editando" variant="ghost" onPress={onBack} disabled={loading} /></View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: Spacing.lg, gap: Spacing.md },
  sessionHeader: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.lg, padding: Spacing.lg, ...Shadows.card },
  sessionTopRow: { alignItems: 'center', flexDirection: 'row' },
  backButton: { alignItems: 'center', borderRadius: Radius.control, height: 44, justifyContent: 'center', width: 44 },
  sessionTitleArea: { flex: 1, marginHorizontal: Spacing.md },
  sessionOrder: { fontSize: 17, fontWeight: '800' },
  sessionRecipient: { fontSize: 12, marginTop: 2 },
  progressPill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  progressPillText: { fontSize: 13, fontWeight: '800' },
  progressTrack: { borderRadius: 4, height: 8, marginTop: Spacing.lg, overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  progressLabel: { fontSize: 12 },
  progressLabelStrong: { fontSize: 12, fontWeight: '700' },
  sectionHint: { fontSize: 12, marginBottom: Spacing.sm, marginTop: Spacing.sm, textAlign: 'center' },
  errorBanner: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, padding: Spacing.md },
  errorBannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  emptyCard: { alignItems: 'center', borderRadius: Radius.card, borderWidth: 1, gap: Spacing.sm, padding: Spacing.xxl },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center' },
  emptyAction: { marginTop: Spacing.sm, width: '100%' },
  itemCard: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.md, padding: Spacing.md },
  itemMain: { alignItems: 'center', flexDirection: 'row' },
  itemIcon: { alignItems: 'center', borderRadius: Radius.control, height: 42, justifyContent: 'center', width: 42 },
  itemCopy: { flex: 1, marginLeft: Spacing.md },
  itemName: { fontSize: 14, fontWeight: '800' },
  itemMeta: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  removeButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  quantityEditor: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  quantityCaption: { fontSize: 12 },
  quantityControls: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  smallQuantityButton: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  sessionQuantity: { fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  detailMetrics: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  metric: { alignItems: 'center', borderRadius: 10, flex: 1, padding: Spacing.sm },
  metricLabel: { fontSize: 10, fontWeight: '600' },
  metricValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  loadMore: { marginTop: Spacing.sm },
  stickyFooter: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, gap: Spacing.sm, left: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, position: 'absolute', right: 0, ...Shadows.floating },
  footerSummary: { alignItems: 'center' },
  footerTotal: { fontSize: 14, fontWeight: '800' },
  footerPending: { fontSize: 11, marginTop: 2 },
  footerButtons: { flexDirection: 'row', gap: Spacing.sm },
  footerButton: { flex: 1, paddingHorizontal: Spacing.sm },
  productReviewContent: { padding: Spacing.lg },
  productReviewHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: Spacing.lg },
  productReviewCard: { borderRadius: Radius.card, borderWidth: 1, gap: Spacing.md, padding: Spacing.lg, ...Shadows.card },
  productHeading: { alignItems: 'center', flexDirection: 'row', marginBottom: Spacing.sm },
  productIcon: { alignItems: 'center', borderRadius: 18, height: 54, justifyContent: 'center', width: 54 },
  productReady: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  productName: { fontSize: 19, fontWeight: '800', marginTop: 2 },
  warehouseRow: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', padding: Spacing.md },
  warehouseName: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  reviewMetrics: { flexDirection: 'row', gap: Spacing.sm },
  quantityTitle: { fontSize: 14, fontWeight: '800', marginTop: Spacing.sm, textAlign: 'center' },
  largeQuantityRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  largeQuantityButton: { alignItems: 'center', borderRadius: Radius.control, height: 52, justifyContent: 'center', width: 52 },
  quantityInputContainer: { flex: 1, marginBottom: 0 },
  quantityInput: { fontSize: 21, fontWeight: '800', textAlign: 'center' },
  quickQuantities: { flexDirection: 'row', gap: Spacing.sm },
  quickButton: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, padding: Spacing.sm },
  reviewError: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  successScreen: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  successStatus: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, padding: Spacing.md },
  successStatusText: { flex: 1, fontSize: 13, fontWeight: '600' },
  successActions: { gap: Spacing.sm, marginTop: Spacing.xl },
  reviewList: { padding: Spacing.lg },
  reviewHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: Spacing.lg },
  reviewTitle: { ...Typography.title, fontSize: 25, lineHeight: 30 },
  reviewSummary: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.lg, padding: Spacing.lg },
  reviewSummaryTotal: { fontSize: 17, fontWeight: '800' },
  reviewSummaryStatus: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  observationInput: { borderRadius: Radius.control, borderWidth: 1.5, fontSize: 15, marginBottom: Spacing.lg, minHeight: 92, padding: Spacing.md, textAlignVertical: 'top' },
  reviewSectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: Spacing.md },
  reviewItem: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', marginBottom: Spacing.sm, padding: Spacing.md },
  reviewItemQuantity: { fontSize: 20, fontWeight: '800', marginLeft: Spacing.md },
});
