import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { MaterialIcons } from '@expo/vector-icons';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useDashboardStats } from '@/hooks/useDashboardStats';

export default function HomeScreen() {
  const { user } = useAuth();
  const { isAdmin } = useUserRoles();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const { entriesToday, exitsToday, loading } = useDashboardStats();
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
            <DashboardCard
              title="Entradas Hoy"
              value={entriesToday}
              subtitle="Productos recibidos"
              icon="input"
              iconColor={colors.success.main}
              trend="up"
            />
            <DashboardCard
              title="Salidas Hoy"
              value={exitsToday}
              subtitle="Productos despachados"
              icon="local-shipping"
              iconColor={colors.error.main}
              trend="down"
            />
          </>
        )}
      </View>

      <View style={styles.menuSection}>
        <Text style={[styles.menuTitle, { color: colors.text.primary }]}>Menú de Operaciones</Text>
        
        {isAdmin() && (
          <TouchableOpacity 
            style={[styles.menuItem, { backgroundColor: colors.background.paper, borderLeftColor: colors.primary.main }]}
            onPress={handleViewReports}
            activeOpacity={0.8}
          >
            <View style={styles.menuItemContent}>
              <View style={[styles.iconContainer, { backgroundColor: colors.primary.main + '15' }]}>
                <MaterialIcons 
                  name="assessment" 
                  size={28} 
                  color={colors.primary.main}
                />
              </View>
              <View style={styles.menuItemTextContainer}>
                <Text style={[styles.menuItemText, { color: colors.text.primary }]}>
                  Reportes
                </Text>
                <Text style={[styles.menuItemSubtext, { color: colors.text.secondary }]}>
                  Análisis y estadísticas
                </Text>
              </View>
              <MaterialIcons 
                name="chevron-right" 
                size={24} 
                color={colors.text.secondary} 
              />
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.menuItem, { backgroundColor: colors.background.paper, borderLeftColor: colors.success.main }]}
          onPress={handleRegisterEntries}
          activeOpacity={0.8}
        >
          <View style={styles.menuItemContent}>
            <View style={[styles.iconContainer, { backgroundColor: colors.success.main + '15' }]}>
              <MaterialIcons 
                name="input" 
                size={28} 
                color={colors.success.main}
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={[styles.menuItemText, { color: colors.text.primary }]}>Registrar Entradas</Text>
              <Text style={[styles.menuItemSubtext, { color: colors.text.secondary }]}>
                Ingreso de productos
              </Text>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={colors.text.secondary} 
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuItem, { backgroundColor: colors.background.paper, borderLeftColor: colors.error.main }]}
          onPress={handleRegisterExits}
          activeOpacity={0.8}
        >
          <View style={styles.menuItemContent}>
            <View style={[styles.iconContainer, { backgroundColor: colors.error.main + '15' }]}>
              <MaterialIcons 
                name="local-shipping" 
                size={28} 
                color={colors.error.main}
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={[styles.menuItemText, { color: colors.text.primary }]}>
                Registrar Salidas
              </Text>
              <Text style={[styles.menuItemSubtext, { color: colors.text.secondary }]}>
                Despacho de productos
              </Text>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={colors.text.secondary} 
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuItem, { backgroundColor: colors.background.paper, borderLeftColor: colors.warning.main }]}
          onPress={handleViewReceivedOrders}
          activeOpacity={0.8}
        >
          <View style={styles.menuItemContent}>
            <View style={[styles.iconContainer, { backgroundColor: colors.warning.main + '15' }]}>
              <MaterialIcons 
                name="receipt-long" 
                size={28} 
                color={colors.warning.main}
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={[styles.menuItemText, { color: colors.text.primary }]}>
                Mis Órdenes Recibidas
              </Text>
              <Text style={[styles.menuItemSubtext, { color: colors.text.secondary }]}>
                Historial de recepciones
              </Text>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={colors.text.secondary} 
            />
          </View>
        </TouchableOpacity>

        {isAdmin() && (
          <TouchableOpacity 
            style={[styles.menuItem, { backgroundColor: colors.background.paper, borderLeftColor: colors.info.main }]}
            onPress={handleViewAllOrders}
            activeOpacity={0.8}
          >
            <View style={styles.menuItemContent}>
              <View style={[styles.iconContainer, { backgroundColor: colors.info.main + '15' }]}>
                <MaterialIcons 
                  name="list-alt" 
                  size={28} 
                  color={colors.info.main}
                />
              </View>
              <View style={styles.menuItemTextContainer}>
                <Text style={[styles.menuItemText, { color: colors.text.primary }]}>
                  Todas las Órdenes
                </Text>
                <Text style={[styles.menuItemSubtext, { color: colors.text.secondary }]}>
                  Gestión completa
                </Text>
              </View>
              <MaterialIcons 
                name="chevron-right" 
                size={24} 
                color={colors.text.secondary} 
              />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {user && (
        <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Sesión activa</Text>
          <Text style={[styles.cardText, { color: colors.text.secondary }]}>
            <Text style={[styles.label, { color: colors.text.primary }]}>Usuario: </Text>
            {user.email}
          </Text>
        </Card>
      )}
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
  card: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  cardText: {
    fontSize: 14,
    marginBottom: 8,
  },
  label: {
    fontWeight: '600',
  },
  button: {
    marginTop: 8,
  },
  menuSection: {
    marginBottom: 24,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  menuItem: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 0,
    borderLeftWidth: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuItemTextContainer: {
    flex: 1,
  },
  menuItemText: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuItemSubtext: {
    fontSize: 13,
    fontWeight: '400',
  },
  menuItemTextDisabled: {
    opacity: 0.6,
  },
  dashboardContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
