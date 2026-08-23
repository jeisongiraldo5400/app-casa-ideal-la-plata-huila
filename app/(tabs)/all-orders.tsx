import { AllDeliveryOrdersList, AllOrdersList, usePurchaseOrders } from '@/components/purchase-orders';
import { useTheme } from '@/components/theme';
import { SearchField, SegmentedControl } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

type TabType = 'purchase' | 'delivery';

export default function AllOrdersScreen() {
  const { loadPurchaseOrders, loading } = usePurchaseOrders();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [activeTab, setActiveTab] = useState<TabType>('delivery');
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);

  useEffect(() => {
    void loadPurchaseOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    void loadPurchaseOrders();
    setDeliveryRefreshKey((key) => key + 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <Text style={[styles.header, { color: colors.text.secondary }]}>Consulta las órdenes registradas en el sistema</Text>
      <SearchField
        containerStyle={styles.search}
        placeholder={activeTab === 'delivery' ? 'Buscar orden, cliente o dirección' : 'Buscar orden o proveedor'}
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={styles.tabs}>
        <SegmentedControl
          items={[
            { value: 'delivery', label: 'Entrega', icon: 'local-shipping' },
            { value: 'purchase', label: 'Compra', icon: 'receipt-long' },
          ]}
          value={activeTab}
          onChange={(value) => {
            setActiveTab(value as TabType);
            setSearchQuery('');
          }}
        />
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={colors.primary.main} />}>
        {activeTab === 'purchase'
          ? <AllOrdersList searchQuery={searchQuery} />
          : <AllDeliveryOrdersList searchQuery={searchQuery} refreshTrigger={deliveryRefreshKey} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 14, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
  search: { marginHorizontal: Spacing.xl },
  tabs: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  content: { flex: 1 },
  contentContainer: { padding: Spacing.xl },
});
