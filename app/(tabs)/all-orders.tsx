import { AllDeliveryOrdersList, AllOrdersList, usePurchaseOrders } from '@/components/purchase-orders';
import { useTheme } from '@/components/theme';
import { SearchField, SegmentedControl } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import { useAllOrdersRouteState, type AllOrdersTab } from '@/components/purchase-orders/infrastructure/hooks/useAllOrdersRouteState';
import { useScreenLoading } from '@/hooks/useScreenLoading';
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type TabType = AllOrdersTab;

export default function AllOrdersScreen() {
  return (
    <ScreenErrorBoundary screen="Todas las órdenes" logModule="purchase_orders">
      <AllOrdersScreenInner />
    </ScreenErrorBoundary>
  );
}

function AllOrdersScreenInner() {
  const { loadPurchaseOrders, loading } = usePurchaseOrders();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  // Una notificación abre esta pantalla ya situada: en su pestaña y con el
  // número de orden escrito en el buscador, así que la lista queda filtrada a
  // la orden del aviso (también si la pantalla ya estaba abierta).
  const { activeTab, setActiveTab, searchQuery, setSearchQuery } = useAllOrdersRouteState();
  const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);
  // Publica la carga de esta pantalla al aviso global (components/ui/GlobalLoadingBar).
  useScreenLoading(loading);


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
      {/* Las órdenes de entrega se pintan en una FlatList que pagina al llegar
          al final y trae su propio «deslizar para actualizar», así que no puede
          ir dentro de este ScrollView. Las de compra siguen igual. */}
      {activeTab === 'purchase' ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={colors.primary.main} />}>
          <AllOrdersList searchQuery={searchQuery} />
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.contentContainer]}>
          <AllDeliveryOrdersList searchQuery={searchQuery} refreshTrigger={deliveryRefreshKey} />
        </View>
      )}
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
