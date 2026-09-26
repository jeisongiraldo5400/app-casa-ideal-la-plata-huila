import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { ActionCard, HeroActionCard, ScreenErrorBoundary, ScreenHeader, SectionHeader, StatCard } from '@/components/ui';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useNavigateWithLoading } from '@/hooks/useNavigateWithLoading';
import { useUserRoles } from '@/hooks/useUserRoles';
import { isOfflineError } from '@/lib/errorMessage';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  // El menú de inicio navega avisando al indicador global: el usuario ve que
  // algo pasa aunque la pantalla destino tarde en traer sus datos.
  const navigate = useNavigateWithLoading();
  const { user } = useAuth();
  const { pendingOrders, pendingDeliveryOrders, loading, error: statsError, reload: reloadStats } = useDashboardStats();
  const { isAdmin, isVendedor, isGestorCobro, isRecaudador, canAccessCatalogs } = useUserRoles();
  const [now, setNow] = useState(new Date());
  const canCreateNegocio = isAdmin() || isVendedor() || isGestorCobro();
  // El recaudador sólo consulta y cobra: ve Negocios y Cartera, no crea negocios
  // ni entra a Clientes.
  const showCommercialSection = canCreateNegocio || isRecaudador();
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

  // "—" mientras carga y también cuando la consulta falló: un cero inventado
  // haría creer al usuario que no tiene nada pendiente.
  const ordersValue = pendingOrders ?? '—';
  const deliveriesValue = pendingDeliveryOrders ?? '—';
  const statsHint = loading ? 'Actualizando…' : statsError ? 'Sin consultar' : 'Pendientes';
  // Sin red el mensaje traducido ya lo dice todo; para otros fallos se añade
  // qué se estaba consultando para que el aviso no quede en el aire.
  const statsNotice = statsError
    ? isOfflineError(statsError)
      ? 'Sin conexión: no se pudo consultar el resumen. Toca para reintentar.'
      : `No se pudo consultar el resumen: ${statsError} Toca para reintentar.`
    : null;
  const cardHint = (value: number | null) =>
    loading ? 'cargando' : value === null ? 'no se pudo consultar' : String(value);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background.default }]} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow="Casa Ideal"
          title={`Hola, ${userName}`}
          subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        />

        <View style={styles.section}>
          <SectionHeader title="Resumen de hoy" hint={statsHint} />
          <View style={styles.statsRow} accessibilityState={{ busy: loading }}>
            <StatCard
              label="Órdenes de compra"
              value={ordersValue}
              icon="receipt-long"
              color={colors.warning.main}
              accessibilityLabel={`Órdenes de compra pendientes: ${cardHint(pendingOrders)}`}
            />
            <StatCard
              label="Órdenes de entrega"
              value={deliveriesValue}
              icon="local-shipping"
              color={colors.info.main}
              accessibilityLabel={`Órdenes de entrega pendientes: ${cardHint(pendingDeliveryOrders)}`}
            />
          </View>
          {!loading && statsNotice ? (
            <TouchableOpacity onPress={() => void reloadStats()} accessibilityRole="button">
              <Text style={[styles.statsNotice, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
                {statsNotice}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {showCommercialSection ? (
          <View style={styles.section}>
            <SectionHeader title="Gestión comercial" />
            {canCreateNegocio ? (
              <HeroActionCard
                title="Crear nuevo negocio"
                subtitle="Crédito y orden de entrega"
                icon="handshake"
                onPress={() => navigate('/(tabs)/negocio-create')}
              />
            ) : null}
            <View style={styles.actionGrid}>
              <ActionCard compact title="Negocios" subtitle={isGestorCobro() ? 'Por cobrar y consultar' : 'Consultar y cobrar'} icon="payments" onPress={() => navigate('/(tabs)/negocios')} style={styles.halfCard} />
              <ActionCard compact title="Cartera" subtitle="Saldos y cuotas" icon="account-balance-wallet" onPress={() => navigate('/(tabs)/cartera')} style={styles.halfCard} />
              {canCreateNegocio ? (
                <ActionCard compact title="Clientes" subtitle="Buscar, crear y asignar" icon="groups" onPress={() => navigate('/(tabs)/clientes' as never)} style={styles.fullCard} />
              ) : null}
            </View>
            {isGestorCobro() ? (
              <ActionCard title="Mi ruta de cobros" subtitle="Organiza las visitas del día" icon="route" tone="success" onPress={() => navigate('/(tabs)/ruta-cobros' as never)} />
            ) : null}
          </View>
        ) : null}

        {CATALOGOS_HABILITADOS && canAccessCatalogs() ? (
          <View style={styles.section}>
            <SectionHeader title="Catálogos" />
            <View style={styles.actionGrid}>
              <ActionCard compact title="Catálogos" subtitle="Ediciones para clientes" icon="auto-stories" onPress={() => navigate('/(tabs)/catalogos' as never)} style={styles.halfCard} />
              <ActionCard compact title="Nuevo catálogo" subtitle="Elegir productos y compartir" icon="add-circle-outline" tone="info" onPress={() => navigate('/(tabs)/catalogo-create' as never)} style={styles.halfCard} />
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Operaciones de almacén" />
          <View style={styles.actionGrid}>
            <ActionCard compact title="Salidas" subtitle="Registrar despacho" icon="local-shipping" tone="error" onPress={() => navigate('/(tabs)/exits')} style={styles.halfCard} />
            <ActionCard compact title="Entradas" subtitle="Ingresar mercancía" icon="move-to-inbox" tone="success" onPress={() => navigate('/(tabs)/entries')} style={styles.halfCard} />
            <ActionCard compact title="Mis órdenes" subtitle="Asignadas para salida" icon="assignment-ind" tone="warning" onPress={() => navigate('/(tabs)/my-orders')} style={styles.halfCard} />
            <ActionCard compact title="Todas" subtitle="Gestión de órdenes" icon="list-alt" tone="info" onPress={() => navigate('/(tabs)/all-orders')} style={styles.halfCard} />
          </View>
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
  statsNotice: { ...Typography.metadata },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  // flexBasis + flexGrow: dos por fila sin depender del padding del contenedor.
  halfCard: { flexBasis: '45%', flexGrow: 1 },
  fullCard: { flexBasis: '100%' },
});
