import { AllDeliveryOrdersList, AllOrdersList, usePurchaseOrders } from '@/components/purchase-orders';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type TabType = 'purchase' | 'delivery';

export default function AllOrdersScreen() {
  const { loadPurchaseOrders, loading } = usePurchaseOrders();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [activeTab, setActiveTab] = useState<TabType>('purchase');

  useEffect(() => {
    // Cargar todas las órdenes al montar el componente
    loadPurchaseOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    loadPurchaseOrders();
  };



  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <View style={[styles.header, { backgroundColor: colors.background.default }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Todas las Órdenes</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Visualiza todas las órdenes registradas en el sistema
        </Text>
      </View>

      <View style={[styles.tabsContainer, { backgroundColor: colors.background.paper }]}>
        <View style={[styles.tabsWrapper, { backgroundColor: colors.background.default }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'purchase' && [styles.tabActive, { backgroundColor: colors.background.paper }],
            ]}
            onPress={() => setActiveTab('purchase')}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="receipt-long"
              size={20}
              color={activeTab === 'purchase' ? colors.primary.main : colors.text.secondary}
            />
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === 'purchase' ? colors.primary.main : colors.text.secondary,
                  fontWeight: activeTab === 'purchase' ? '600' : '400',
                },
              ]}
            >
              Órdenes de Compra
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'delivery' && [styles.tabActive, { backgroundColor: colors.background.paper }],
            ]}
            onPress={() => setActiveTab('delivery')}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="local-shipping"
              size={20}
              color={activeTab === 'delivery' ? colors.primary.main : colors.text.secondary}
            />
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === 'delivery' ? colors.primary.main : colors.text.secondary,
                  fontWeight: activeTab === 'delivery' ? '600' : '400',
                },
              ]}
            >
              Órdenes de Entrega
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
        }
      >
        {activeTab === 'purchase' ? <AllOrdersList /> : <AllDeliveryOrdersList />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tabsWrapper: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderRadius: 8,
  },
  tabActive: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
});

