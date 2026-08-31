import { EntryConfirmation } from '@/components/entries/components/EntryConfirmation';
import { EntryScanningWorkspace } from '@/components/entries/components/EntryScanningWorkspace';
import { ProductForm } from '@/components/entries/components/ProductForm';
import { SetupForm } from '@/components/entries/components/SetupForm';
import { useEntries } from '@/components/entries/infrastructure/hooks/useEntries';
import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function EntriesScreen() {
  const { step, currentScannedBarcode, error, loading, loadingMessage, clearError, resetCurrentScan, resetAll } = useEntries();
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
    <>
      <Modal visible={loading && step !== 'setup' && step !== 'flow-selection' && step !== 'scanning'} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.loadingOverlay}><View style={[styles.loadingCard, { backgroundColor: colors.background.paper }]}><ActivityIndicator size="large" color={colors.primary.main} /><Text style={[styles.loadingTitle, { color: colors.text.primary }]}>{loadingMessage || 'Procesando...'}</Text><Text style={[styles.loadingText, { color: colors.text.secondary }]}>Por favor espere</Text></View></View>
      </Modal>

      {step === 'confirmation' ? <EntryConfirmation /> : null}
      {step === 'scanning' ? <EntryScanningWorkspace /> : null}
      {step === 'product-form' && currentScannedBarcode ? <ProductForm barcode={currentScannedBarcode} onProductCreated={() => undefined} onCancel={() => { resetCurrentScan(); clearError(); }} /> : null}
      {(step === 'setup' || step === 'flow-selection') ? (
        <ScrollView style={[styles.container, { backgroundColor: colors.background.default }]} contentContainerStyle={styles.content}>
          <Text style={[styles.header, { color: colors.text.secondary }]}>Registra mercancía recibida en bodega</Text>
          <SetupForm />
          {error ? <View style={[styles.error, { backgroundColor: `${colors.error.main}14`, borderColor: colors.error.main }]}><MaterialIcons name="error-outline" size={20} color={colors.error.main} /><Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text></View> : null}
        </ScrollView>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { paddingBottom: Spacing.xxl }, header: { fontSize: 15, fontWeight: '500', lineHeight: 20, marginBottom: Spacing.md, marginTop: Spacing.lg, paddingHorizontal: Spacing.xl }, error: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, margin: Spacing.xl, padding: Spacing.md }, errorText: { flex: 1, fontSize: 14, fontWeight: '600' }, loadingOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center' }, loadingCard: { alignItems: 'center', borderRadius: Radius.card, minWidth: 210, padding: Spacing.xxxl, ...Shadows.floating }, loadingTitle: { fontSize: 16, fontWeight: '700', marginTop: Spacing.lg }, loadingText: { fontSize: 14, marginTop: Spacing.sm },
});
