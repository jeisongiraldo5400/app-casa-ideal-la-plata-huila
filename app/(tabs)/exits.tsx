import { ExitOrderConfirmation } from '@/components/exits/components/ExitOrderConfirmation';
import { ExitScanningWorkspace } from '@/components/exits/components/ExitScanningWorkspace';
import { SetupForm } from '@/components/exits/components/SetupForm';
import { useExits } from '@/components/exits/infrastructure/hooks/useExits';
import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function ExitsScreen() {
  const {
    step,
    error,
    loading,
    loadingMessage,
    resetAll,
  } = useExits();

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
      {/* Modal de loading: no bloquear durante configuración (setup); el formulario ya muestra carga inline */}
      <Modal
        visible={loading && step !== 'setup'}
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

      {step === 'confirmation' ? (
        <ExitOrderConfirmation />
      ) : step === 'scanning' ? (
        <ExitScanningWorkspace />
      ) : (
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background.default }]}
          contentContainerStyle={styles.content}
        >
      <Text style={[styles.header, { color: isDark ? colors.text.primary : colors.text.secondary }]}>Registre la salida de mercancía de bodega</Text>

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
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xl,
  },
  header: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: Spacing.xxl,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  scanCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.xxl,
  },
  scanCardContent: {
    alignItems: 'center',
  },
  scanIconContainer: {
    width: 80,
    height: 80,
    borderRadius: Radius.panel,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  scanSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  scanButtons: {
    width: '100%',
    gap: 12,
  },
  scanButton: {
    width: '100%',
  },
  cancelScanButton: {
    width: '100%',
    marginTop: 0,
  },
  productSection: {
    paddingHorizontal: Spacing.xl,
  },
  quantityCard: {
    marginTop: 16,
    marginBottom: 16,
    padding: 20,
  },
  actionsContainer: {
    marginTop: 8,
    marginBottom: 16,
    gap: 12,
  },
  addButton: {
    marginTop: 0,
  },
  cancelButton: {
    marginTop: 0,
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: Radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    padding: 32,
    borderRadius: Radius.card,
    alignItems: 'center',
    minWidth: 200,
    ...Shadows.floating,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
});
