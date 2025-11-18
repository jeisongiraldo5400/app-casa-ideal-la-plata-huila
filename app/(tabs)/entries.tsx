import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useEntries } from '@/components/entries/infrastructure/hooks/useEntries';
import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { ProductFound } from '@/components/entries/components/ProductFound';
import { QuantityInput } from '@/components/entries/components/QuantityInput';
import { SetupForm } from '@/components/entries/components/SetupForm';
import { ProductForm } from '@/components/entries/components/ProductForm';
import { EntryItemsList } from '@/components/entries/components/EntryItemsList';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';

export default function EntriesScreen() {
  const {
    step,
    currentProduct,
    currentScannedBarcode,
    currentQuantity,
    entryItems,
    scanBarcode,
    addProductToEntry,
    setQuantity,
    resetCurrentScan,
    clearError,
    goBackToSetup,
  } = useEntries();

  const [showScanner, setShowScanner] = useState(false);

  const handleScan = async (barcode: string) => {
    await scanBarcode(barcode);
    setShowScanner(false);
  };

  const handleAddProduct = () => {
    if (!currentProduct || currentQuantity <= 0) {
      Alert.alert('Error', 'Por favor ingrese una cantidad válida');
      return;
    }

    addProductToEntry(currentProduct, currentQuantity, currentScannedBarcode || '');
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Entradas de Productos</Text>
        <Text style={styles.subtitle}>Registre la entrada de mercancía a bodega</Text>
      </View>

      {step === 'setup' && <SetupForm />}

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
                onSubmit={handleAddProduct}
                loading={false}
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
});
