import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { useInventoryStore } from '@/components/inventory/infrastructure/store/inventoryStore';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

export default function QuickSearchScreen() {
  const router = useRouter();
  const { setSearchQuery, loadInventory } = useInventoryStore();
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
    router.push('/(tabs)');
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
        Alert.alert(
          'Producto no encontrado',
          `No se encontró un producto con el código de barras: ${barcode}`,
          [
            { text: 'Intentar de nuevo', style: 'default' },
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: goHome,
            },
          ]
        );
        return;
      }

      await loadInventory();
      setSearchQuery(barcode);
      router.push('/(tabs)/inventory');
      setScannerActive(false);
    } catch (error: any) {
      console.error('Error searching product:', error);
      Alert.alert('Error', 'Ocurrió un error al buscar el producto', [
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
