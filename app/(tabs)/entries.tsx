import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { EntryScanningWorkspace } from '@/components/entries/components/EntryScanningWorkspace';
import { ProductForm } from '@/components/entries/components/ProductForm';
import { SetupForm } from '@/components/entries/components/SetupForm';
import { useEntries } from '@/components/entries/infrastructure/hooks/useEntries';
import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function EntriesScreen() {
  const { step, currentScannedBarcode, error, finalizing, loadingMessage, clearError, resetCurrentScan, resetAll, lastFinalizeResult, dismissLastFinalizeResult } = useEntries((state) => ({ step: state.step, currentScannedBarcode: state.currentScannedBarcode, error: state.error, finalizing: state.finalizing, loadingMessage: state.loadingMessage, clearError: state.clearError, resetCurrentScan: state.resetCurrentScan, resetAll: state.resetAll, lastFinalizeResult: state.lastFinalizeResult, dismissLastFinalizeResult: state.dismissLastFinalizeResult }));
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }

      return () => {
        resetTimerRef.current = setTimeout(() => {
          resetAll();
          resetTimerRef.current = null;
        }, 400);
      };
    }, [resetAll])
  );

  return (
    <ScreenErrorBoundary
      screen="Entradas"
      logModule="entries"
      onReset={resetAll}
      getDebugContext={() => {
        const state = useEntriesStore.getState();
        return {
          step: state.step,
          uiStage: state.uiStage,
          entryType: state.entryType,
          warehouseId: state.warehouseId,
          supplierId: state.supplierId,
          purchaseOrderId: state.purchaseOrderId,
          entryItemsCount: state.entryItems.length,
          loading: state.loading,
          finalizing: state.finalizing,
        };
      }}
    >
      {/* Único caso bloqueante: el registro en BD. El resto de cargas se muestran en línea. */}
      <Modal visible={finalizing} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.loadingOverlay}><View style={[styles.loadingCard, { backgroundColor: colors.background.paper }]}><ActivityIndicator size="large" color={colors.primary.main} /><Text style={[styles.loadingTitle, { color: colors.text.primary }]}>{loadingMessage || 'Procesando...'}</Text><Text style={[styles.loadingText, { color: colors.text.secondary }]}>Por favor espere</Text></View></View>
      </Modal>

      {step === 'scanning' ? <EntryScanningWorkspace /> : null}
      {step === 'product-form' && currentScannedBarcode ? <ProductForm barcode={currentScannedBarcode} onProductCreated={() => undefined} onCancel={() => { resetCurrentScan(); clearError(); }} /> : null}
      {(step === 'setup' || step === 'flow-selection') ? (
        <ScrollView style={[styles.container, { backgroundColor: colors.background.default }]} contentContainerStyle={styles.content}>
          <Text style={[styles.header, { color: colors.text.secondary }]}>Registra mercancía recibida en bodega</Text>
          {lastFinalizeResult ? (
            <View
              style={[styles.lastResult, { backgroundColor: lastFinalizeResult.ok ? `${colors.success.main}14` : `${colors.error.main}14`, borderColor: lastFinalizeResult.ok ? colors.success.main : colors.error.main }]}
              accessibilityLiveRegion="polite"
            >
              <MaterialIcons name={lastFinalizeResult.ok ? 'check-circle' : 'error-outline'} size={22} color={lastFinalizeResult.ok ? colors.success.main : colors.error.main} />
              <View style={styles.lastResultCopy}>
                <Text style={[styles.lastResultTitle, { color: colors.text.primary }]}>{lastFinalizeResult.ok ? 'Tu entrada anterior quedó registrada' : 'Tu entrada anterior no se registró'}</Text>
                <Text style={[styles.lastResultText, { color: colors.text.secondary }]}>{lastFinalizeResult.ok ? `${lastFinalizeResult.summary.productCount} productos · ${lastFinalizeResult.summary.totalUnits} unidades${lastFinalizeResult.summary.orderNumber ? ` · OC #${lastFinalizeResult.summary.orderNumber}` : ''}` : lastFinalizeResult.error.message}</Text>
              </View>
              <Pressable onPress={dismissLastFinalizeResult} accessibilityRole="button" accessibilityLabel="Cerrar aviso" hitSlop={8}>
                <MaterialIcons name="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>
          ) : null}
          <SetupForm />
          {error ? <View style={[styles.error, { backgroundColor: `${colors.error.main}14`, borderColor: colors.error.main }]}><MaterialIcons name="error-outline" size={20} color={colors.error.main} /><Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text></View> : null}
        </ScrollView>
      ) : null}
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },
  header: { ...Typography.body, fontWeight: '500', marginBottom: Spacing.md, marginTop: Spacing.lg, paddingHorizontal: Spacing.xl },
  lastResult: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, marginHorizontal: Spacing.xl, padding: Spacing.md },
  lastResultCopy: { flex: 1 },
  lastResultTitle: { ...Typography.bodySmallStrong },
  lastResultText: { ...Typography.caption, marginTop: 2 },
  error: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, margin: Spacing.xl, padding: Spacing.md },
  errorText: { ...Typography.bodySmallStrong, flex: 1 },
  loadingOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center' },
  loadingCard: { alignItems: 'center', borderRadius: Radius.card, minWidth: 210, padding: Spacing.xxxl, ...Shadows.floating },
  loadingTitle: { ...Typography.bodyStrong, marginTop: Spacing.lg },
  loadingText: { ...Typography.bodySmall, marginTop: Spacing.sm },
});
