import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { EntryItemsList } from '@/components/entries/components/EntryItemsList';
import { ProductForm } from '@/components/entries/components/ProductForm';
import { ProductFound } from '@/components/entries/components/ProductFound';
import { PurchaseOrderProgress } from '@/components/entries/components/PurchaseOrderProgress';
import { QuantityInput } from '@/components/entries/components/QuantityInput';
import { SetupForm } from '@/components/entries/components/SetupForm';
import { useEntries } from '@/components/entries/infrastructure/hooks/useEntries';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Colors, getColors } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
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
    reset,
  } = useEntries();

  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const [showScanner, setShowScanner] = useState(false);

  // Limpiar completamente el estado de entradas cuando se sale de la pantalla
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

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
      {/* Modal de loading de pantalla completa */}
      <Modal
        visible={loading}
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

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Entradas de Productos</Text>
        <Text style={styles.subtitle}>Registre la entrada de mercancía a bodega</Text>
      </View>

      {(step === 'setup' || step === 'flow-selection') && <SetupForm />}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {step === 'scanning' && (
        <>
          {!currentProduct && !currentScannedBarcode && (
            <View style={styles.scanSection}>
              <Button
                title="Escanear código de barras"
                onPress={() => setShowScanner(true)}
                style={styles.scanButton}
              />
              <Button
                title="Cancelar"
                onPress={goBackToSetup}
                variant="outline"
                style={styles.cancelScanButton}
              />
            </View>
          )}

          {currentProduct && (
            <>
              <ProductFound product={currentProduct} />
              <QuantityInput
                quantity={currentQuantity}
                onQuantityChange={setQuantity}
              />
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
            </>
          )}

          {/* Mostrar progreso de orden de compra si hay una orden seleccionada */}
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
    backgroundColor: Colors.background.default,
  },
  content: {
    paddingBottom: 20,
  },
  header: {
    marginBottom: 24,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
  },
  scanSection: {
    marginTop: 32,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scanButton: {
    minWidth: 200,
  },
  cancelScanButton: {
    minWidth: 200,
    marginTop: 12,
  },
  actionsContainer: {
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  addButton: {
    marginTop: 8,
  },
  cancelButton: {
    marginTop: 8,
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.error.light + '20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error.main,
  },
  errorText: {
    fontSize: 14,
    color: Colors.error.main,
    fontWeight: '500',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
