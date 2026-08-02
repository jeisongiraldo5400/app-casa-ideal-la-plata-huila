import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { fetchMyCollectionRoutes } from '@/lib/collection-routes/collectionRouteService';
import { CollectionRouteSummary } from '@/lib/collection-routes/types';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-CO')}`;
const statusLabel = { borrador: 'Borrador', activa: 'En curso', completada: 'Completada', cancelada: 'Cancelada' };

export default function CollectionRoutesScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { loading: rolesLoading, isGestorCobro } = useUserRoles();
  const canUseRoutes = isGestorCobro();
  const [routes, setRoutes] = useState<CollectionRouteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setRoutes(await fetchMyCollectionRoutes());
    } catch (e: any) {
      setError(e.message || 'No fue posible cargar las rutas');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { if (!rolesLoading && canUseRoutes) load(); }, [canUseRoutes, load, rolesLoading]));

  if (rolesLoading || loading) return <View style={styles.center}><ActivityIndicator color={colors.primary.main} /></View>;
  if (!canUseRoutes) return <View style={styles.center}><MaterialIcons name="lock" size={44} color={colors.text.secondary} /><Text style={{ color: colors.text.primary }}>Este módulo es exclusivo para gestores de cobro.</Text></View>;

  const active = routes.find((route) => route.status === 'activa' || route.status === 'borrador');
  return (
    <ScrollView style={{ backgroundColor: colors.background.default }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={[styles.hero, { backgroundColor: colors.primary.main }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>GESTIÓN DIARIA</Text>
          <Text style={styles.title}>Mi ruta de cobros</Text>
          <Text style={styles.subtitle}>Organiza tus visitas y mira avanzar tu recorrido.</Text>
        </View>
        <MaterialIcons name="route" size={54} color="#ffffff55" />
      </View>

      {error ? <Text style={[styles.error, { color: colors.error.main }]}>{error}</Text> : null}

      {active ? (
        <TouchableOpacity style={[styles.activeCard, { backgroundColor: colors.background.paper }]} onPress={() => router.push(`/ruta-cobros/${active.id}` as any)}>
          <View style={styles.rowBetween}>
            <View style={[styles.iconCircle, { backgroundColor: active.status === 'activa' ? '#dbeafe' : '#f1f5f9' }]}>
              <MaterialIcons name={active.status === 'activa' ? 'near-me' : 'edit-road'} size={26} color={active.status === 'activa' ? '#2563eb' : '#64748b'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Ruta de hoy</Text>
              <Text style={{ color: colors.text.secondary }}>{statusLabel[active.status]} · {active.completed_count}/{active.stop_count} visitas</Text>
            </View>
            <MaterialIcons name="chevron-right" size={28} color={colors.text.secondary} />
          </View>
          <View style={styles.metrics}>
            <View><Text style={styles.metricLabel}>Esperado</Text><Text style={[styles.metricValue, { color: colors.text.primary }]}>{money(active.expected_total)}</Text></View>
            <View><Text style={styles.metricLabel}>Recaudado</Text><Text style={[styles.metricValue, { color: colors.success.main }]}>{money(active.collected_total)}</Text></View>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.createCard, { backgroundColor: colors.background.paper, borderColor: colors.primary.main }]} onPress={() => router.push('/(tabs)/ruta-cobros-crear' as any)}>
          <MaterialIcons name="add-road" size={38} color={colors.primary.main} />
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Crear ruta del día</Text>
          <Text style={{ color: colors.text.secondary, textAlign: 'center' }}>Selecciona y ordena los negocios que visitarás.</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Historial reciente</Text>
      {routes.filter((route) => route.id !== active?.id).map((route) => (
        <TouchableOpacity key={route.id} style={[styles.historyCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]} onPress={() => router.push(`/ruta-cobros/${route.id}` as any)}>
          <MaterialIcons name={route.status === 'completada' ? 'check-circle' : 'cancel'} size={24} color={route.status === 'completada' ? colors.success.main : colors.text.secondary} />
          <View style={{ flex: 1 }}><Text style={{ color: colors.text.primary, fontWeight: '800' }}>{new Date(`${route.route_date}T12:00:00`).toLocaleDateString('es-CO')}</Text><Text style={{ color: colors.text.secondary }}>{route.completed_count}/{route.stop_count} visitas · {money(route.collected_total)}</Text></View>
          <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{statusLabel[route.status]}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40, gap: 14 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  hero: { borderRadius: 22, padding: 20, flexDirection: 'row', alignItems: 'center' }, eyebrow: { color: '#bfdbfe', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, title: { color: '#fff', fontWeight: '900', fontSize: 24, marginTop: 4 }, subtitle: { color: '#dbeafe', marginTop: 5, lineHeight: 19 },
  error: { padding: 12, borderRadius: 10 }, activeCard: { borderRadius: 18, padding: 16, elevation: 2 }, createCard: { borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', padding: 26, alignItems: 'center', gap: 8 }, rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 }, iconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }, cardTitle: { fontSize: 17, fontWeight: '900' }, metrics: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#cbd5e1', paddingTop: 14, marginTop: 14 }, metricLabel: { color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: '700' }, metricValue: { fontSize: 16, fontWeight: '900', marginTop: 3 }, sectionTitle: { fontSize: 17, fontWeight: '900', marginTop: 8 }, historyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
});
