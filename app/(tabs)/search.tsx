import { BarcodeScanner } from '@/components/entries/components/BarcodeScanner';
import { useInventoryStore } from '@/components/inventory/infrastructure/store/inventoryStore';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function QuickSearchScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { setSearchQuery, loadInventory } = useInventoryStore();
  const [showScanner, setShowScanner] = useState(false);

  // Al salir de la pestaña, cerrar la cámara (evita montar/desmontar expo-camera al cambiar de tab).
  useFocusEffect(
    useCallback(() => {
      return () => {
        setShowScanner(false);
      };
    }, [])
  );

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

      await loadInventory();
      setSearchQuery(barcode);
      router.push('/(tabs)/inventory');
      setShowScanner(false);
    } catch (error: any) {
      console.error('Error searching product:', error);
      Alert.alert('Error', 'Ocurrió un error al buscar el producto', [
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
      ]);
    }
  };

  const handleClose = () => {
    setShowScanner(false);
    router.back();
  };

  if (showScanner) {
    return <BarcodeScanner onScan={handleScan} onClose={handleClose} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <MaterialIcons name="qr-code-scanner" size={64} color={colors.primary.main} style={styles.heroIcon} />
      <Text style={[styles.title, { color: colors.text.primary }]}>Búsqueda rápida</Text>
      <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
        Toca el botón para abrir la cámara y escanear el código de un producto.
      </Text>
      <TouchableOpacity
        style={[styles.scanButton, { backgroundColor: colors.primary.main }]}
        onPress={() => setShowScanner(true)}
        activeOpacity={0.85}>
        <MaterialIcons name="photo-camera" size={24} color={colors.primary.contrastText} />
        <Text style={[styles.scanButtonText, { color: colors.primary.contrastText }]}>Escanear código</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroIcon: {
    marginBottom: 20,
    opacity: 0.9,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 340,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  scanButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
