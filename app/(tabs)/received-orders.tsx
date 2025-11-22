import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { usePurchaseOrders } from '@/components/purchase-orders';
import { ReceivedOrdersList } from '@/components/purchase-orders/components/ReceivedOrdersList';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors } from '@/constants/theme';

export default function ReceivedOrdersScreen() {
  const { user } = useAuth();
  const { loadPurchaseOrders, loading } = usePurchaseOrders();

  useEffect(() => {
    if (user) {
      // Cargar órdenes recibidas del usuario logueado
      loadPurchaseOrders('received', user.id);
    }
  }, [user]);

  const handleRefresh = () => {
    if (user) {
      loadPurchaseOrders('received', user.id);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }>
      <View style={styles.header}>
        <Text style={styles.title}>Mis Órdenes Recibidas</Text>
        <Text style={styles.subtitle}>
          Órdenes de compra que has marcado como recibidas
        </Text>
      </View>

      <ReceivedOrdersList />
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
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
  },
});

