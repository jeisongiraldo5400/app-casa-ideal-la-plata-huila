import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { usePurchaseOrders } from '@/components/purchase-orders';
import { ReceivedDeliveryOrdersList } from '@/components/purchase-orders/components/ReceivedDeliveryOrdersList';
import { ReceivedOrdersList } from '@/components/purchase-orders/components/ReceivedOrdersList';
import { useTheme } from '@/components/theme';
import { SegmentedControl } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

type TabType = 'purchase' | 'delivery';

export default function ReceivedOrdersScreen() {
  const { loadPurchaseOrders, loading } = usePurchaseOrders();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [activeTab, setActiveTab] = useState<TabType>('delivery');

  useEffect(() => {
    if (user) void loadPurchaseOrders('received', user.id);
  }, [loadPurchaseOrders, user]);

  const handleRefresh = () => {
    if (user) void loadPurchaseOrders('received', user.id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <Text style={[styles.header, { color: colors.text.secondary }]}>Historial de órdenes marcadas como recibidas</Text>
      <View style={styles.tabs}>
        <SegmentedControl
          items={[
            { value: 'delivery', label: 'Entrega', icon: 'local-shipping' },
            { value: 'purchase', label: 'Compra', icon: 'receipt-long' },
          ]}
          value={activeTab}
          onChange={(value) => setActiveTab(value as TabType)}
        />
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={colors.primary.main} />}>
        {activeTab === 'purchase' ? <ReceivedOrdersList /> : <ReceivedDeliveryOrdersList />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 14, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
  tabs: { paddingHorizontal: Spacing.xl },
  content: { flex: 1 },
  contentContainer: { padding: Spacing.xl },
});
