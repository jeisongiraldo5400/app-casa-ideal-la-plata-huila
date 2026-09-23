import { BarcodeScanner } from '@/components/scanning';
import { useInventoryStore } from '@/components/inventory/infrastructure/store/inventoryStore';
import { describeScanFailure } from '@/lib/barcodeScanFeedback';
import { logHandledError } from '@/lib/errorMessage';
import { supabase } from '@/lib/supabase';
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

  const handleScan = async (barcode: string) => {
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .is('deleted_at', null)
        .single();

      if (error || !product) {
        // Un fallo de red llega aquí dentro de `error`, no como excepción: el
        // aviso distingue «no existe» de «no se pudo consultar».
        const alert = describeScanFailure(error, barcode);
        Alert.alert(alert.title, alert.message, [
          { text: 'Intentar de nuevo', style: 'default' },
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: goHome,
          },
        ]);
        return;
      }

      setSearchQuery(barcode);
      router.navigate('/(tabs)/inventory');
      setScannerActive(false);
    } catch (error: unknown) {
      logHandledError('Buscar producto por código de barras', error);
      const alert = describeScanFailure(error, barcode);
      Alert.alert(alert.title, alert.message, [
        { text: 'Intentar de nuevo', style: 'default' },
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: goHome,
        },
      ]);
    }
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
