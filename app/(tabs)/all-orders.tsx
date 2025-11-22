import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { usePurchaseOrders, AllOrdersList } from '@/components/purchase-orders';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';

export default function AllOrdersScreen() {
  const { loadPurchaseOrders, loading } = usePurchaseOrders();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  useEffect(() => {
    // Cargar todas las órdenes sin filtrar por estado o usuario
    loadPurchaseOrders();
  }, [loadPurchaseOrders]);

  const handleRefresh = () => {
    loadPurchaseOrders();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Todas las Órdenes</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Visualiza todas las órdenes de compra registradas en el sistema
        </Text>
      </View>

      <AllOrdersList />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
});

