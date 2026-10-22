import { BarcodeScanner } from '@/components/scanning';
import { useInventoryStore } from '@/components/inventory/infrastructure/store/inventoryStore';
import { describeScanFailure } from '@/lib/barcodeScanFeedback';
import { logHandledError } from '@/lib/errorMessage';
import { lookupScannedBarcode } from '@/components/inventory/infrastructure/services/scanLookupService';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function QuickSearchScreen() {
  return (
    <ScreenErrorBoundary screen="Buscar producto">
      <QuickSearchScreenInner />
    </ScreenErrorBoundary>
  );
}

function QuickSearchScreenInner() {
  const router = useRouter();
  const { setSearchQuery } = useInventoryStore();
  const [scannerActive, setScannerActive] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setScannerActive(true);
      return () => {
        setScannerActive(false);
      };
    }, [])
  );

  const goHome = () => {
    router.navigate('/(tabs)');
  };

  const showScanAlert = (alert: { title: string; message: string }) => {
    Alert.alert(alert.title, alert.message, [
      { text: 'Intentar de nuevo', style: 'default' },
      {
        text: 'Cancelar',
        style: 'cancel',
        onPress: goHome,
      },
    ]);
  };

  const handleScan = async (barcode: string) => {
    // Sin señal busca en el catálogo descargado (ver lookupScannedBarcode).
    const result = await lookupScannedBarcode(barcode);
    if (result.status === 'found') {
      setSearchQuery(barcode);
      router.navigate('/(tabs)/inventory');
      setScannerActive(false);
      return;
    }
    if (result.status === 'missing') {
      showScanAlert(
        result.fromLocal
          ? {
              title: 'No está en el teléfono',
              message: `El código ${barcode} no vino en la última descarga. Con señal se consulta en el servidor.`,
            }
          : describeScanFailure(null, barcode)
      );
      return;
    }
    // Un fallo de red llega dentro de `error`: el aviso distingue «no existe»
    // de «no se pudo consultar».
    logHandledError('Buscar producto por código de barras', result.error);
    showScanAlert(describeScanFailure(result.error, barcode));
  };

  const handleClose = () => {
    setScannerActive(false);
    goHome();
  };

  if (scannerActive) {
    return <BarcodeScanner onScan={handleScan} onClose={handleClose} />;
  }

  return <View style={{ flex: 1 }} />;
}
