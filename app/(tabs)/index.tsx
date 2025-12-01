import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useDashboardStats } from '@/hooks/useDashboardStats';

export default function HomeScreen() {
  const { isAdmin } = useUserRoles();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const { entriesToday, exitsToday, pendingOrders, pendingDeliveryOrders, loading } = useDashboardStats();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

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

  const handleViewReceivedOrders = () => {
    router.push('/(tabs)/received-orders');
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

      <View style={styles.dashboardContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary.main} />
          </View>
        ) : (
          <>
            <View style={styles.topCardsRow}>
              <View style={styles.halfWidthCard}>
                <DashboardCard
                  title="Salidas Hoy"
                  value={exitsToday}
                  subtitle="Productos despachados"
                  icon="local-shipping"
                  iconColor={colors.error.main}
                  trend="down"
                />
              </View>
              <View style={styles.halfWidthCard}>
                <DashboardCard
                  title="Entradas Hoy"
                  value={entriesToday}
                  subtitle="Productos recibidos"
                  icon="input"
                  iconColor={colors.success.main}
                  trend="up"
                />
              </View>
            </View>
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
        <View style={styles.menuHeader}>
          <Text style={[styles.menuTitle, { color: colors.text.primary }]}>Menú de Operaciones</Text>
          <View style={[styles.menuTitleUnderline, { backgroundColor: colors.primary.main }]} />
        </View>
        
        <View style={styles.menuGrid}>
          {isAdmin() && (
            <TouchableOpacity 
              style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
              onPress={handleViewReports}
              activeOpacity={0.7}
            >
              <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.primary.main + '12' }]}>
                <MaterialIcons 
                  name="assessment" 
                  size={24} 
                  color={colors.primary.main}
                />
              </View>
              <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={2}>
                Reportes
              </Text>
              <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                Análisis
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            onPress={handleRegisterExits}
            activeOpacity={0.7}
          >
            <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.error.main + '12' }]}>
              <MaterialIcons 
                name="local-shipping" 
                size={24} 
                color={colors.error.main}
              />
            </View>
            <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={2}>
              Registrar Salidas
            </Text>
            <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
              Despacho
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            onPress={handleRegisterEntries}
            activeOpacity={0.7}
          >
            <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.success.main + '12' }]}>
              <MaterialIcons 
                name="input" 
                size={24} 
                color={colors.success.main}
              />
            </View>
            <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={2}>
              Registrar Entradas
            </Text>
            <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
              Ingreso
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
            onPress={handleViewReceivedOrders}
            activeOpacity={0.7}
          >
            <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.warning.main + '12' }]}>
              <MaterialIcons 
                name="receipt-long" 
                size={24} 
                color={colors.warning.main}
              />
            </View>
            <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={2}>
              Mis Órdenes
            </Text>
            <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
              Historial
            </Text>
          </TouchableOpacity>

          {isAdmin() && (
            <TouchableOpacity 
              style={[styles.menuCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
              onPress={handleViewAllOrders}
              activeOpacity={0.7}
            >
              <View style={[styles.menuCardIconWrapper, { backgroundColor: colors.info.main + '12' }]}>
                <MaterialIcons 
                  name="list-alt" 
                  size={24} 
                  color={colors.info.main}
                />
              </View>
              <Text style={[styles.menuCardTitle, { color: colors.text.primary }]} numberOfLines={2}>
                Todas las Órdenes
              </Text>
              <Text style={[styles.menuCardSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                Gestión
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
  button: {
    marginTop: 8,
  },
  menuSection: {
    marginBottom: 32,
  },
  menuHeader: {
    marginBottom: 20,
  },
  menuTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 4,
    letterSpacing: -0.5,
  },
  menuTitleUnderline: {
    height: 3,
    width: 60,
    borderRadius: 2,
    marginLeft: 4,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  menuCard: {
    borderRadius: 16,
    padding: 16,
    width: '48%',
    minHeight: 140,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
  },
  menuCardIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  menuCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  menuCardSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  dashboardContainer: {
    flexDirection: 'column',
    marginBottom: 24,
    gap: 12,
  },
  topCardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidthCard: {
    flex: 1,
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
