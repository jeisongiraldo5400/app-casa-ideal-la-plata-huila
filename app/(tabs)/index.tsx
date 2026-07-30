import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { MaterialIcons } from '@expo/vector-icons';
import { useUserRoles } from '@/hooks/useUserRoles';

export default function HomeScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const { pendingOrders, pendingDeliveryOrders, loading } = useDashboardStats();
  const { isAdmin, isVendedor, isGestorCobro } = useUserRoles();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const showCommercialSection = isAdmin() || isVendedor() || isGestorCobro();
  const canCreateNegocio = isAdmin() || isVendedor() || isGestorCobro();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000); // Actualizar cada segundo

    return () => clearInterval(timer);
  }, []);

  const formatDateTime = (date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  const handleRegisterEntries = () => {
    router.push('/(tabs)/entries');
  };

  const handleRegisterExits = () => {
    router.push('/(tabs)/exits');
  };

  const handleViewMyOrders = () => {
    router.push('/(tabs)/my-orders');
  };

  const handleViewAllOrders = () => {
    router.push('/(tabs)/all-orders');
  };

  const handleViewReports = () => {
    router.push('/(tabs)/reports');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background.default }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Casa Ideal</Text>
          <Text style={[styles.dateTime, { color: colors.text.secondary }]}>{formatDateTime(currentDateTime)}</Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Bienvenido de vuelta</Text>
      </View>

      {showCommercialSection && (
        <View style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 2 }}>
            Gestión Comercial & Crédito
          </Text>
          {canCreateNegocio && (
            <TouchableOpacity
              style={[styles.sellerCta, { backgroundColor: colors.primary.main, marginBottom: 0 }]}
              onPress={() => router.push('/(tabs)/negocio-create')}
              activeOpacity={0.85}
            >
              <MaterialIcons name="handshake" size={28} color={colors.primary.contrastText} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary.contrastText, fontWeight: '700', fontSize: 16 }}>
                  Nuevo negocio
                </Text>
                <Text style={{ color: colors.primary.contrastText, opacity: 0.9, fontSize: 13 }}>
                  Crear crédito y generar orden de entrega
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.primary.contrastText} />
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.sellerSecondary, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
              onPress={() => router.push('/(tabs)/negocios')}
            >
              <MaterialIcons name="payments" size={22} color={colors.primary.main} />
              <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Negocios / Cobrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sellerSecondary, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
              onPress={() => router.push('/(tabs)/cartera')}
            >
              <MaterialIcons name="account-balance-wallet" size={22} color={colors.info.main} />
              <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Cartera</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.dashboardContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary.main} />
          </View>
        ) : (
          <>
            <View style={[styles.ordersCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
              <View style={styles.ordersCardHeader}>
                <Text style={[styles.ordersCardTitle, { color: colors.text.primary }]}>Órdenes Pendientes</Text>
                <View style={[styles.ordersCardIconContainer, { backgroundColor: colors.warning.main + '15' }]}>
                  <MaterialIcons name="pending-actions" size={24} color={colors.warning.main} />
                </View>
              </View>
              <View style={styles.ordersCardContent}>
                <View style={styles.ordersCardRow}>
                  <View style={styles.ordersCardItem}>
                    <Text style={[styles.ordersCardValue, { color: colors.text.primary }]}>{pendingOrders}</Text>
                    <Text style={[styles.ordersCardLabel, { color: colors.text.secondary }]}>Órdenes de compra</Text>
                  </View>
                  <View style={[styles.ordersCardDivider, { backgroundColor: colors.divider }]} />
                  <View style={styles.ordersCardItem}>
                    <Text style={[styles.ordersCardValue, { color: colors.text.primary }]}>{pendingDeliveryOrders}</Text>
                    <Text style={[styles.ordersCardLabel, { color: colors.text.secondary }]}>Órdenes de entrega</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      <View style={styles.menuSection}>
        <Text style={[styles.sectionHeaderTitle, { color: colors.text.secondary }]}>
          OPERACIONES DE ALMACÉN
        </Text>

        <View style={styles.menuGrid}>
          <TouchableOpacity
            style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            onPress={handleRegisterExits}
            activeOpacity={0.7}
          >
            <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.error.main + '15' }]}>
              <MaterialIcons
                name="local-shipping"
                size={22}
                color={colors.error.main}
              />
            </View>
            <View style={styles.menuCardTextContainer}>
              <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={1}>
                Salidas
              </Text>
              <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                Despacho
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            onPress={handleRegisterEntries}
            activeOpacity={0.7}
          >
            <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.success.main + '15' }]}>
              <MaterialIcons
                name="input"
                size={22}
                color={colors.success.main}
              />
            </View>
            <View style={styles.menuCardTextContainer}>
              <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={1}>
                Entradas
              </Text>
              <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                Ingreso
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            onPress={handleViewMyOrders}
            activeOpacity={0.7}
          >
            <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.warning.main + '15' }]}>
              <MaterialIcons
                name="receipt-long"
                size={22}
                color={colors.warning.main}
              />
            </View>
            <View style={styles.menuCardTextContainer}>
              <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={1}>
                Mis Órdenes
              </Text>
              <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                Asignadas para salida
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            onPress={handleViewAllOrders}
            activeOpacity={0.7}
          >
            <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.info.main + '15' }]}>
              <MaterialIcons
                name="list-alt"
                size={22}
                color={colors.info.main}
              />
            </View>
            <View style={styles.menuCardTextContainer}>
              <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={1}>
                Todas Órdenes
              </Text>
              <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                Gestión
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.reportsBannerCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
          onPress={handleViewReports}
          activeOpacity={0.75}
        >
          <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.primary.main + '15' }]}>
            <MaterialIcons name="assessment" size={22} color={colors.primary.main} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={1}>
              Reportes & Analítica
            </Text>
            <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
              Estadísticas e indicadores
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
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
    marginBottom: 32,
    marginTop: 20,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    flex: 1,
  },
  dateTime: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 12,
  },
  subtitle: {
    fontSize: 16,
  },
  sellerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
  },
  sellerSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  button: {
    marginTop: 8,
  },
  menuSection: {
    marginBottom: 24,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
    marginLeft: 2,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '48.5%',
    minHeight: 68,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
  },
  menuCardIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCardTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  menuCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 1,
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  menuCardSubtitle: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
  },
  reportsBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    minHeight: 68,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  dashboardContainer: {
    flexDirection: 'column',
    marginBottom: 24,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 140,
  },
  ordersCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  ordersCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  ordersCardIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ordersCardContent: {
    flex: 1,
  },
  ordersCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  ordersCardItem: {
    flex: 1,
    alignItems: 'center',
  },
  ordersCardValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
  },
  ordersCardLabel: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
  },
  ordersCardDivider: {
    width: 1,
    height: 50,
    marginHorizontal: 12,
  },
});
