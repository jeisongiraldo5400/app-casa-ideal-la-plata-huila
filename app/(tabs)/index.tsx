import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { ActionCard, ScreenHeader, StatCard } from '@/components/ui';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useUserRoles } from '@/hooks/useUserRoles';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const { user } = useAuth();
  const { pendingOrders, pendingDeliveryOrders, loading } = useDashboardStats();
  const { isAdmin, isVendedor, isGestorCobro } = useUserRoles();
  const [now, setNow] = useState(new Date());
  const showCommercialSection = isAdmin() || isVendedor() || isGestorCobro();
  const canCreateNegocio = isAdmin() || isVendedor() || isGestorCobro();
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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background.default }]} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow="Casa Ideal"
          title={`Hola, ${userName}`}
          subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
          actionIcon="person"
          actionLabel="Abrir perfil"
          onActionPress={() => router.push('/(tabs)/profile')}
        />

        <View style={[styles.hero, { backgroundColor: colors.primary.main }]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>CENTRO DE OPERACIONES</Text>
            <Text style={styles.heroTitle}>Todo listo para trabajar</Text>
            <Text style={styles.heroSubtitle}>Consulta órdenes, registra movimientos y controla la operación desde un solo lugar.</Text>
          </View>
          <View style={styles.heroIcon}><MaterialIcons name="space-dashboard" size={30} color={colors.primary.contrastText} /></View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Resumen de hoy</Text>
          <Text style={[styles.sectionHint, { color: colors.text.secondary }]}>Pendientes</Text>
        </View>

        {loading ? (
          <View style={[styles.loading, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <ActivityIndicator color={colors.primary.main} />
            <Text style={[styles.loadingText, { color: colors.text.secondary }]}>Actualizando resumen…</Text>
          </View>
        ) : (
          <View style={styles.statsRow}>
            <StatCard label="Órdenes de compra" value={pendingOrders} icon="receipt-long" color={colors.warning.main} />
            <StatCard label="Órdenes de entrega" value={pendingDeliveryOrders} icon="local-shipping" color={colors.info.main} />
          </View>
        )}

        {showCommercialSection ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Gestión comercial</Text>
            {canCreateNegocio ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(tabs)/negocio-create')}
                style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.navigation.background }, pressed && styles.pressed]}>
                <View style={[styles.primaryActionIcon, { backgroundColor: colors.primary.main }]}><MaterialIcons name="handshake" size={25} color="#fff" /></View>
                <View style={styles.primaryActionCopy}>
                  <Text style={styles.primaryActionTitle}>Crear nuevo negocio</Text>
                  <Text style={styles.primaryActionSubtitle}>Crédito y orden de entrega</Text>
                </View>
                <MaterialIcons name="arrow-forward" size={21} color={colors.navigation.inactive} />
              </Pressable>
            ) : null}
            <View style={styles.actionGrid}>
              <ActionCard compact title="Negocios" subtitle="Consultar y cobrar" icon="payments" onPress={() => router.push('/(tabs)/negocios')} style={styles.halfCard} />
              <ActionCard compact title="Cartera" subtitle="Saldos y cuotas" icon="account-balance-wallet" onPress={() => router.push('/(tabs)/cartera')} style={styles.halfCard} />
              <ActionCard compact title="Buscar cliente" subtitle="Historial y créditos" icon="person-search" onPress={() => router.push('/(tabs)/buscar-cliente' as never)} style={styles.fullCard} />
            </View>
            {isGestorCobro() ? <ActionCard title="Mi ruta de cobros" subtitle="Organiza las visitas del día" icon="route" tone="success" onPress={() => router.push('/(tabs)/ruta-cobros' as never)} /> : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Operaciones de almacén</Text>
          <View style={styles.actionGrid}>
            <ActionCard compact title="Salidas" subtitle="Registrar despacho" icon="local-shipping" tone="error" onPress={() => router.push('/(tabs)/exits')} style={styles.halfCard} />
            <ActionCard compact title="Entradas" subtitle="Ingresar mercancía" icon="move-to-inbox" tone="success" onPress={() => router.push('/(tabs)/entries')} style={styles.halfCard} />
            <ActionCard compact title="Mis órdenes" subtitle="Asignadas para salida" icon="assignment-ind" tone="warning" onPress={() => router.push('/(tabs)/my-orders')} style={styles.halfCard} />
            <ActionCard compact title="Todas" subtitle="Gestión de órdenes" icon="list-alt" tone="info" onPress={() => router.push('/(tabs)/all-orders')} style={styles.halfCard} />
          </View>
          <ActionCard title="Reportes y analítica" subtitle="Estadísticas e indicadores de la operación" icon="insights" onPress={() => router.push('/(tabs)/reports')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xxl },
  hero: { minHeight: 170, borderRadius: Radius.panel, padding: Spacing.xxl, flexDirection: 'row', alignItems: 'flex-start', ...Shadows.card },
  heroCopy: { flex: 1, paddingRight: Spacing.md },
  heroEyebrow: { color: '#bfdbfe', fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 25, lineHeight: 31, fontWeight: '900', marginTop: Spacing.sm },
  heroSubtitle: { color: '#dbeafe', fontSize: 13, lineHeight: 19, marginTop: Spacing.sm },
  heroIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  section: { gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -Spacing.md },
  sectionTitle: { ...Typography.section },
  sectionHint: { ...Typography.metadata },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  loading: { minHeight: 126, borderRadius: Radius.card, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  loadingText: { ...Typography.metadata },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  halfCard: { width: '48%' },
  fullCard: { width: '100%' },
  primaryAction: { minHeight: 88, borderRadius: Radius.card, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  primaryActionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryActionCopy: { flex: 1 },
  primaryActionTitle: { color: '#fff', fontSize: 16, lineHeight: 21, fontWeight: '800' },
  primaryActionSubtitle: { color: '#cbd5e1', fontSize: 12, lineHeight: 16, marginTop: 2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
