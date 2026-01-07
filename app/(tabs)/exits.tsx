import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { DeliveryOrderProgress } from '@/components/exits/components/DeliveryOrderProgress';
import { ExitItemsList } from '@/components/exits/components/ExitItemsList';
import { ProductFound } from '@/components/exits/components/ProductFound';
import { QuantityInput } from '@/components/exits/components/QuantityInput';
import { SetupForm } from '@/components/exits/components/SetupForm';
import { useExits } from '@/components/exits/infrastructure/hooks/useExits';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

export default function ExitsScreen() {
  const {
    step,
    selectedDeliveryOrderId,
    currentProduct,
    currentScannedBarcode,
    currentQuantity,
    currentAvailableStock,
    exitItems,
    error,
    loading,
    loadingMessage,
    scanBarcode,
    addProductToExit,
    setQuantity,
    resetCurrentScan,
    clearError,
    goBackToSetup,
    reset,
  } = useExits();

  const { isDark } = useTheme();
  const colors = getColors(isDark);
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

      // Procesar el escaneo con manejo de errores mejorado
      try {
        await scanBarcode(trimmedBarcode);
      } catch (scanError: any) {
        console.error('Error en scanBarcode:', scanError);
        // El error ya está manejado en el store, solo asegurar que el scanner esté cerrado
        setShowScanner(false);
      }
    } catch (error: any) {
      console.error('Error al escanear código:', error);
      // Asegurar que el scanner esté cerrado incluso si hay error
      setShowScanner(false);
      // Limpiar cualquier estado de error previo
      clearError();
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

      <ScrollView
        style={[styles.container, { backgroundColor: colors.background.default }]}
        contentContainerStyle={styles.content}
      >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={[styles.iconContainer, { backgroundColor: colors.error.main + '15' }]}>
            <MaterialIcons name="local-shipping" size={28} color={colors.error.main} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text.primary }]}>Salidas de Productos</Text>
            <Text style={[styles.subtitle, { 
              color: isDark ? colors.text.primary : colors.text.secondary 
            }]}>
              Registre la salida de mercancía de bodega
            </Text>
          </View>
        </View>
      </View>

      {step === 'setup' && <SetupForm />}

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
                  Use el escáner para buscar productos por código de barras
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
              <ProductFound product={currentProduct} availableStock={currentAvailableStock} />
              <Card style={[styles.quantityCard, { backgroundColor: colors.background.paper }]}>
                <QuantityInput
                  quantity={currentQuantity}
                  maxQuantity={currentAvailableStock}
                  onQuantityChange={setQuantity}
                />
              </Card>
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
            </View>
          )}

          {/* Mostrar progreso de orden de entrega si hay una orden seleccionada */}
          {selectedDeliveryOrderId && <DeliveryOrderProgress />}

          {exitItems.length > 0 && <ExitItemsList />}
        </>
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
    paddingBottom: 20,
  },
  header: {
    marginBottom: 24,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  scanCard: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    padding: 24,
  },
  scanCardContent: {
    alignItems: 'center',
  },
  scanIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
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
    paddingHorizontal: 20,
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
    borderRadius: 12,
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

