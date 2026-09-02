import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { ActionCard, HeroActionCard, ScreenErrorBoundary, ScreenHeader, SectionHeader, StatCard } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <ScreenErrorBoundary screen="Inicio">
      <HomeScreenInner />
    </ScreenErrorBoundary>
  );
}

function HomeScreenInner() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const { user } = useAuth();
  const { pendingOrders, pendingDeliveryOrders, loading } = useDashboardStats();
  const { isAdmin, isVendedor, isGestorCobro } = useUserRoles();
  const [now, setNow] = useState(new Date());
  const showCommercialSection = isAdmin() || isVendedor() || isGestorCobro();
  const canCreateNegocio = showCommercialSection;
  const userName = user?.email?.split('@')[0]?.replace(/[._-]/g, ' ') || 'usuario';

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  // Mientras carga se muestran las tarjetas con "—" para no saltar el layout.
  const ordersValue = loading ? '—' : pendingOrders;
  const deliveriesValue = loading ? '—' : pendingDeliveryOrders;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background.default }]} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow="Casa Ideal"
          title={`Hola, ${userName}`}
          subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        />

        <View style={styles.section}>
          <SectionHeader title="Resumen de hoy" hint={loading ? 'Actualizando…' : 'Pendientes'} />
          <View style={styles.statsRow} accessibilityState={{ busy: loading }}>
            <StatCard
              label="Órdenes de compra"
              value={ordersValue}
              icon="receipt-long"
              color={colors.warning.main}
              accessibilityLabel={loading ? 'Órdenes de compra pendientes, cargando' : `Órdenes de compra pendientes: ${pendingOrders}`}
            />
            <StatCard
              label="Órdenes de entrega"
              value={deliveriesValue}
              icon="local-shipping"
              color={colors.info.main}
              accessibilityLabel={loading ? 'Órdenes de entrega pendientes, cargando' : `Órdenes de entrega pendientes: ${pendingDeliveryOrders}`}
            />
          </View>
        </View>

        {showCommercialSection ? (
          <View style={styles.section}>
            <SectionHeader title="Gestión comercial" />
            {canCreateNegocio ? (
              <HeroActionCard
                title="Crear nuevo negocio"
                subtitle="Crédito y orden de entrega"
                icon="handshake"
                onPress={() => router.navigate('/(tabs)/negocio-create')}
              />
            ) : null}
            <View style={styles.actionGrid}>
              <ActionCard compact title="Negocios" subtitle="Consultar y cobrar" icon="payments" onPress={() => router.navigate('/(tabs)/negocios')} style={styles.halfCard} />
              <ActionCard compact title="Cartera" subtitle="Saldos y cuotas" icon="account-balance-wallet" onPress={() => router.navigate('/(tabs)/cartera')} style={styles.halfCard} />
              <ActionCard compact title="Buscar cliente" subtitle="Historial y créditos" icon="person-search" onPress={() => router.navigate('/(tabs)/buscar-cliente' as never)} style={styles.fullCard} />
            </View>
            {isGestorCobro() ? (
              <ActionCard title="Mi ruta de cobros" subtitle="Organiza las visitas del día" icon="route" tone="success" onPress={() => router.navigate('/(tabs)/ruta-cobros' as never)} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Operaciones de almacén" />
          <View style={styles.actionGrid}>
            <ActionCard compact title="Salidas" subtitle="Registrar despacho" icon="local-shipping" tone="error" onPress={() => router.navigate('/(tabs)/exits')} style={styles.halfCard} />
            <ActionCard compact title="Entradas" subtitle="Ingresar mercancía" icon="move-to-inbox" tone="success" onPress={() => router.navigate('/(tabs)/entries')} style={styles.halfCard} />
            <ActionCard compact title="Mis órdenes" subtitle="Asignadas para salida" icon="assignment-ind" tone="warning" onPress={() => router.navigate('/(tabs)/my-orders')} style={styles.halfCard} />
            <ActionCard compact title="Todas" subtitle="Gestión de órdenes" icon="list-alt" tone="info" onPress={() => router.navigate('/(tabs)/all-orders')} style={styles.halfCard} />
          </View>
          <ActionCard title="Reportes y analítica" subtitle="Estadísticas e indicadores de la operación" icon="insights" onPress={() => router.navigate('/(tabs)/reports')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xxl },
  section: { gap: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  // flexBasis + flexGrow: dos por fila sin depender del padding del contenedor.
  halfCard: { flexBasis: '45%', flexGrow: 1 },
  fullCard: { flexBasis: '100%' },
});
