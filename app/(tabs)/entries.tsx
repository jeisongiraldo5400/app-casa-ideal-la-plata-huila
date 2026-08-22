import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { EntryItemsList } from '@/components/entries/components/EntryItemsList';
import { EntrySessionContext } from '@/components/entries/components/EntrySessionContext';
import { ProductForm } from '@/components/entries/components/ProductForm';
import { ProductFound } from '@/components/entries/components/ProductFound';
import { PurchaseOrderProgress } from '@/components/entries/components/PurchaseOrderProgress';
import { QuantityInput } from '@/components/entries/components/QuantityInput';
import { SetupForm } from '@/components/entries/components/SetupForm';
import { useEntries } from '@/components/entries/infrastructure/hooks/useEntries';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

export default function EntriesScreen() {
  const {
    step,
    currentProduct,
    currentScannedBarcode,
    currentQuantity,
    entryItems,
    purchaseOrderId,
    error,
    loading,
    loadingMessage,
    scanBarcode,
    addProductToEntry,
    setQuantity,
    resetCurrentScan,
    clearError,
    goBackToSetup,
    resetAll,
  } = useEntries();

  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const [showScanner, setShowScanner] = useState(false);

  // Reset state when screen loses focus (tab navigation)
  useFocusEffect(
    useCallback(() => {
      // Called when screen gains focus - no action needed
      return () => {
        // Called when screen loses focus - reset all state including cache
        resetAll();
      };
    }, [resetAll])
  );

  const handleScan = async (barcode: string) => {
    try {
      if (!barcode || typeof barcode !== 'string' || barcode.trim() === '') {
        console.warn('Barcode vacío o inválido:', barcode);
        return;
      }

      const trimmedBarcode = barcode.trim();

      // Cerrar el scanner primero para evitar problemas
      setShowScanner(false);

      // Pequeño delay para asegurar que el scanner se cerró
      await new Promise(resolve => setTimeout(resolve, 100));

      // Procesar el escaneo
      await scanBarcode(trimmedBarcode);
    } catch (err: any) {
      console.error('Error al escanear código:', err);
      // Asegurar que el scanner esté cerrado incluso si hay error
      setShowScanner(false);
      // El error será manejado por el store
    }
  };

  const handleAddProduct = async () => {
    if (!currentProduct || currentQuantity <= 0) {
      Alert.alert('Error', 'Por favor ingrese una cantidad válida');
      return;
    }

    clearError(); // Limpiar errores previos
    try {
      await addProductToEntry(currentProduct, currentQuantity, currentScannedBarcode || '');
      // Si hay error después de agregar, se mostrará en la UI
    } catch {
      // El error ya está en el store, no necesitamos hacer nada aquí
    }
  };

  const handleProductCreated = (productId: string) => {
    resetCurrentScan();
  };

  const handleCancelProductForm = () => {
    resetCurrentScan();
    clearError();
  };

  if (showScanner) {
    return (
      <BarcodeScanner
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  return (
    <>
      {/* Modal de loading: no bloquear durante configuración (setup / flow-selection) */}
      <Modal
        visible={loading && step !== 'setup' && step !== 'flow-selection'}
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

      <ScrollView
        style={[styles.container, { backgroundColor: colors.background.default }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={[styles.iconContainer, { backgroundColor: colors.success.main + '15' }]}>
              <MaterialIcons name="inventory" size={28} color={colors.success.main} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text.primary }]}>Entradas de Productos</Text>
              <Text style={[styles.subtitle, {
                color: isDark ? colors.text.primary : colors.text.secondary
              }]}>
                Registre la entrada de mercancía a bodega
              </Text>
            </View>
          </View>
        </View>

        {(step === 'setup' || step === 'flow-selection') && <SetupForm />}

        {error && (
          <View style={[styles.errorContainer, {
            backgroundColor: colors.error.main + '15',
            borderColor: colors.error.main
          }]}>
            <MaterialIcons name="error-outline" size={20} color={colors.error.main} />
            <Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text>
          </View>
        )}

        {step === 'scanning' && (
          <>
            <EntrySessionContext />
            {!currentProduct && !currentScannedBarcode && (
              <Card style={[styles.scanCard, { backgroundColor: colors.background.paper }]}>
                <View style={styles.scanCardContent}>
                  <View style={[styles.scanIconContainer, { backgroundColor: colors.primary.main + '15' }]}>
                    <MaterialIcons name="qr-code-scanner" size={48} color={colors.primary.main} />
                  </View>
                  <Text style={[styles.scanTitle, { color: colors.text.primary }]}>
                    Escanear Producto
                  </Text>
                  <Text style={[styles.scanSubtitle, { color: colors.text.secondary }]}>
                    {purchaseOrderId
                      ? 'Escanee cualquier producto de la orden de compra'
                      : 'Use el escáner para buscar productos por código de barras'}
                  </Text>
                  <View style={styles.scanButtons}>
                    <Button
                      title="Escanear código de barras"
                      onPress={() => {
                        clearError();
                        setShowScanner(true);
                      }}
                      style={styles.scanButton}
                    />
                    <Button
                      title="Volver a configuración"
                      onPress={goBackToSetup}
                      variant="outline"
                      style={styles.cancelScanButton}
                    />
                  </View>
                </View>
              </Card>
            )}

            {error && !currentProduct && !currentScannedBarcode && (
              <Card style={[styles.scanCard, { backgroundColor: colors.background.paper }]}>
                <View style={styles.scanCardContent}>
                  <MaterialIcons name="error-outline" size={48} color={colors.error.main} />
                  <Text style={[styles.scanTitle, { color: colors.text.primary }]}>
                    Error al escanear
                  </Text>
                  <Text style={[styles.scanSubtitle, { color: colors.text.secondary }]}>
                    {error}
                  </Text>
                  <Button
                    title="Intentar escanear de nuevo"
                    onPress={() => {
                      clearError();
                      setShowScanner(true);
                    }}
                    style={styles.scanButton}
                  />
                </View>
              </Card>
            )}

            {currentProduct && (
              <View style={styles.productSection}>
                <ProductFound product={currentProduct} />
                <Card style={[styles.quantityCard, { backgroundColor: colors.background.paper }]}>
                  <QuantityInput
                    quantity={currentQuantity}
                    onQuantityChange={setQuantity}
                  />
                </Card>
                <View style={styles.actionsContainer}>
                  <Button
                    title="Agregar a la entrada"
                    onPress={handleAddProduct}
                    style={styles.addButton}
                  />
                  <Button
                    title="Cancelar"
                    onPress={resetCurrentScan}
                    variant="outline"
                    style={styles.cancelButton}
                  />
                </View>
              </View>
            )}

            {/* El detalle de la OC inicia compacto para priorizar el escaneo. */}
            {purchaseOrderId && <PurchaseOrderProgress />}

            {entryItems.length > 0 && <EntryItemsList />}
          </>
        )}

        {step === 'product-form' && currentScannedBarcode && (
          <ProductForm
            barcode={currentScannedBarcode}
            onProductCreated={handleProductCreated}
            onCancel={handleCancelProductForm}
          />
        )}
      </ScrollView>
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
    marginBottom: Spacing.xxl,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
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
