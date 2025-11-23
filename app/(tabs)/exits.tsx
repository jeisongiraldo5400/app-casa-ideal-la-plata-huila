import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { ExitItemsList } from '@/components/exits/components/ExitItemsList';
import { ProductFound } from '@/components/exits/components/ProductFound';
import { QuantityInput } from '@/components/exits/components/QuantityInput';
import { SetupForm } from '@/components/exits/components/SetupForm';
import { useExits } from '@/components/exits/infrastructure/hooks/useExits';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function ExitsScreen() {
  const {
    step,
    currentProduct,
    currentScannedBarcode,
    currentQuantity,
    currentAvailableStock,
    exitItems,
    error,
    scanBarcode,
    addProductToExit,
    setQuantity,
    resetCurrentScan,
    clearError,
    goBackToSetup,
  } = useExits();

  const [showScanner, setShowScanner] = useState(false);

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
    } catch (error: any) {
      console.error('Error al escanear código:', error);
      // Asegurar que el scanner esté cerrado incluso si hay error
      setShowScanner(false);
      // Mostrar el error en el store si es necesario
      if (error?.message) {
        // El error será manejado por el store
      }
    }
  };

  const handleAddProduct = async () => {
    if (!currentProduct || currentQuantity <= 0) {
      Alert.alert('Error', 'Por favor ingrese una cantidad válida');
      return;
    }

    if (currentQuantity > currentAvailableStock) {
      Alert.alert('Error', `La cantidad no puede exceder el stock disponible: ${currentAvailableStock}`);
      return;
    }

    clearError();
    try {
      await addProductToExit(currentProduct, currentQuantity, currentScannedBarcode || '');
    } catch (error: any) {
      // El error ya está en el store
    }
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Salidas de Productos</Text>
        <Text style={styles.subtitle}>Registre la salida de mercancía de bodega</Text>
      </View>

      {step === 'setup' && <SetupForm />}

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
                onPress={() => {
                  clearError();
                  setShowScanner(true);
                }}
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

          {error && !currentProduct && !currentScannedBarcode && (
            <View style={styles.scanSection}>
              <Button
                title="Intentar escanear de nuevo"
                onPress={() => {
                  clearError();
                  setShowScanner(true);
                }}
                style={styles.scanButton}
              />
            </View>
          )}

          {currentProduct && (
            <>
              <ProductFound product={currentProduct} availableStock={currentAvailableStock} />
              <QuantityInput
                quantity={currentQuantity}
                maxQuantity={currentAvailableStock}
                onQuantityChange={setQuantity}
              />
              <View style={styles.actionsContainer}>
                <Button
                  title="Agregar a la salida"
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

          {exitItems.length > 0 && <ExitItemsList />}
        </>
      )}
    </ScrollView>
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
});

