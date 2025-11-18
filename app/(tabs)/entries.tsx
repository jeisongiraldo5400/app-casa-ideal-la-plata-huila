import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useEntries } from '@/components/entries/infrastructure/hooks/useEntries';
import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { ProductFound } from '@/components/entries/components/ProductFound';
import { QuantityInput } from '@/components/entries/components/QuantityInput';
import { UnregisteredBarcodeAlert } from '@/components/entries/components/UnregisteredBarcodeAlert';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';

export default function EntriesScreen() {
  const {
    currentProduct,
    loading,
    error,
    scannedBarcode,
    quantity,
    scanBarcode,
    registerEntry,
    setQuantity,
    reset,
    clearError,
  } = useEntries();

  const [showScanner, setShowScanner] = useState(false);

  const handleScan = async (barcode: string) => {
    await scanBarcode(barcode);
    setShowScanner(false);
  };

  const handleRegisterEntry = async () => {
    if (!currentProduct || quantity <= 0) {
      Alert.alert('Error', 'Por favor ingrese una cantidad válida');
      return;
    }

    const { error: entryError } = await registerEntry(currentProduct.id, quantity);
    
    if (entryError) {
      Alert.alert('Error', entryError.message || 'Error al registrar la entrada');
    } else {
      Alert.alert(
        'Éxito',
        `Se registraron ${quantity} unidades de ${currentProduct.name}`,
        [
          {
            text: 'OK',
            onPress: () => {
              reset();
            },
          },
        ]
      );
    }
  };

  const handleReset = () => {
    reset();
    clearError();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Entradas de Productos</Text>
        <Text style={styles.subtitle}>Escanea el código de barras para registrar entrada</Text>
      </View>

      {showScanner ? (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      ) : (
        <>
          {!currentProduct && !error && (
            <View style={styles.scanSection}>
              <Button
                title="Escanear código de barras"
                onPress={() => setShowScanner(true)}
                style={styles.scanButton}
              />
            </View>
          )}

          {error && scannedBarcode && (
            <UnregisteredBarcodeAlert
              barcode={scannedBarcode}
              onDismiss={clearError}
            />
          )}

          {currentProduct && (
            <>
              <ProductFound product={currentProduct} />
              <QuantityInput
                quantity={quantity}
                onQuantityChange={setQuantity}
                onSubmit={handleRegisterEntry}
                loading={loading}
                unitOfMeasure={currentProduct.unit_of_measure}
              />
            </>
          )}

          {(currentProduct || error) && (
            <View style={styles.actionsContainer}>
              <Button
                title="Nuevo escaneo"
                onPress={handleReset}
                variant="outline"
                style={styles.resetButton}
              />
            </View>
          )}
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
    padding: 20,
  },
  header: {
    marginBottom: 24,
    marginTop: 20,
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
  },
  scanButton: {
    minWidth: 200,
  },
  actionsContainer: {
    marginTop: 24,
  },
  resetButton: {
    marginTop: 8,
  },
});

