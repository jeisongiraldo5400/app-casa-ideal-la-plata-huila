import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { useInventoryStore } from '@/components/inventory/infrastructure/store/inventoryStore';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

export default function QuickSearchScreen() {
  const router = useRouter();
  const { setSearchQuery, loadInventory } = useInventoryStore();
  const [showScanner, setShowScanner] = useState(true);

  // Resetear el scanner cuando la pantalla vuelve a tener foco
  useFocusEffect(
    useCallback(() => {
      setShowScanner(true);
    }, [])
  );

  const handleScan = async (barcode: string) => {
    try {
      // Buscar el producto por código de barras
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
            {
              text: 'Intentar de nuevo',
              onPress: () => setShowScanner(true),
            },
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => {
                setShowScanner(false);
                router.back();
              },
            },
          ]
        );
        return;
      }

      // Cargar el inventario antes de navegar
      await loadInventory();

      // Establecer la búsqueda con el código de barras
      setSearchQuery(barcode);

      // Navegar al inventario
      router.push('/(tabs)/inventory');
      setShowScanner(false);
    } catch (error: any) {
      console.error('Error searching product:', error);
      Alert.alert(
        'Error',
        'Ocurrió un error al buscar el producto',
        [
          {
            text: 'Intentar de nuevo',
            onPress: () => setShowScanner(true),
          },
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => {
              setShowScanner(false);
              router.back();
            },
          },
        ]
      );
    }
  };

  const handleClose = () => {
    setShowScanner(false);
    router.back();
  };

  if (showScanner) {
    return <BarcodeScanner onScan={handleScan} onClose={handleClose} />;
  }

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.default,
  },
});

