import { ExitScanningWorkspace } from '@/components/exits/components/ExitScanningWorkspace';
import { SetupForm } from '@/components/exits/components/SetupForm';
import { useExits } from '@/components/exits/infrastructure/hooks/useExits';
import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function ExitsScreen() {
  return (
    <ScreenErrorBoundary screen="Salidas" logModule="exits">
      <ExitsScreenInner />
    </ScreenErrorBoundary>
  );
}

function ExitsScreenInner() {
  const {
    step,
    error,
    finalizing,
    loadingMessage,
    resetAll,
    lastFinalizeResult,
    dismissLastFinalizeResult,
  } = useExits((state) => ({ step: state.step, error: state.error, finalizing: state.finalizing, loadingMessage: state.loadingMessage, resetAll: state.resetAll, lastFinalizeResult: state.lastFinalizeResult, dismissLastFinalizeResult: state.dismissLastFinalizeResult }));

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
      {/* Único caso bloqueante: el registro en BD. El resto de cargas se muestran en línea. */}
      <Modal
        visible={finalizing}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}} // Bloquear cierre durante loading
      >
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingContainer, { backgroundColor: colors.background.paper }]}>
            <ActivityIndicator size="large" color={colors.primary.main} />
            <Text style={[styles.loadingText, { color: colors.text.primary }]}>
              {loadingMessage || 'Procesando...'}
            </Text>
            <Text style={[styles.loadingSubtext, { color: colors.text.secondary }]}>
              Por favor espere
            </Text>
          </View>
        </View>
      </Modal>

      {step === 'scanning' ? (
        <ExitScanningWorkspace />
      ) : (
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background.default }]}
          contentContainerStyle={styles.content}
        >
      <Text style={[styles.header, { color: isDark ? colors.text.primary : colors.text.secondary }]}>Registre la salida de mercancía de bodega</Text>

      {lastFinalizeResult ? (
        <View
          style={[styles.lastResult, { backgroundColor: lastFinalizeResult.ok ? `${colors.success.main}14` : `${colors.error.main}14`, borderColor: lastFinalizeResult.ok ? colors.success.main : colors.error.main }]}
          accessibilityLiveRegion="polite"
        >
          <MaterialIcons name={lastFinalizeResult.ok ? 'check-circle' : 'error-outline'} size={22} color={lastFinalizeResult.ok ? colors.success.main : colors.error.main} />
          <View style={styles.lastResultCopy}>
            <Text style={[styles.lastResultTitle, { color: colors.text.primary }]}>{lastFinalizeResult.ok ? 'Tu salida anterior quedó registrada' : 'Tu salida anterior no se registró'}</Text>
            <Text style={[styles.lastResultText, { color: colors.text.secondary }]}>{lastFinalizeResult.ok ? `Orden #${lastFinalizeResult.summary.orderNumber} · ${lastFinalizeResult.summary.productCount} productos · ${lastFinalizeResult.summary.totalUnits} unidades` : lastFinalizeResult.error.message}</Text>
          </View>
          <Pressable onPress={dismissLastFinalizeResult} accessibilityRole="button" accessibilityLabel="Cerrar aviso" hitSlop={8}>
            <MaterialIcons name="close" size={20} color={colors.text.secondary} />
          </Pressable>
        </View>
      ) : null}

      <SetupForm />

      {error && (
        <View style={[styles.errorContainer, { 
          backgroundColor: colors.error.main + '15',
          borderColor: colors.error.main 
        }]}>
          <MaterialIcons name="error-outline" size={20} color={colors.error.main} />
          <Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text>
        </View>
      )}

        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Spacing.xl },
  header: { ...Typography.body, fontWeight: '500', marginBottom: Spacing.xxl, marginTop: Spacing.lg, paddingHorizontal: Spacing.xl },
  lastResult: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, marginHorizontal: Spacing.xl, padding: Spacing.md },
  lastResultCopy: { flex: 1 },
  lastResultTitle: { ...Typography.bodySmallStrong },
  lastResultText: { ...Typography.caption, marginTop: 2 },
  errorContainer: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg, marginHorizontal: Spacing.xl, marginTop: Spacing.lg, padding: Spacing.lg },
  errorText: { ...Typography.bodySmall, flex: 1, fontWeight: '500' },
  loadingOverlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', flex: 1, justifyContent: 'center' },
  loadingContainer: { alignItems: 'center', borderRadius: Radius.card, minWidth: 200, padding: Spacing.xxxl, ...Shadows.floating },
  loadingText: { ...Typography.bodyStrong, marginTop: Spacing.lg, textAlign: 'center' },
  loadingSubtext: { ...Typography.bodySmall, marginTop: Spacing.sm, textAlign: 'center' },
});
