import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useUserRoles } from '@/hooks/useUserRoles';
import { errorMessage } from '@/lib/errorMessage';
import { fetchMyCollectionRoutes } from '@/lib/collection-routes/collectionRouteService';
import { groupRoutesForHome } from '@/lib/collection-routes/routeState';
import { CollectionRouteSummary } from '@/lib/collection-routes/types';
import { bogotaDateValue } from '@/lib/localDate';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-CO')}`;
const statusLabel = { borrador: 'Sin iniciar', activa: 'En curso', completada: 'Completada', cancelada: 'Cancelada' };
const routeDateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-CO');

export default function CollectionRoutesScreen() {
  return (
    <ScreenErrorBoundary screen="Rutas de cobro">
      <CollectionRoutesScreenInner />
    </ScreenErrorBoundary>
  );
}

function CollectionRoutesScreenInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { loading: rolesLoading, isGestorCobro } = useUserRoles();
  // Sin señal se ven las rutas guardadas en el teléfono; crear una necesita
  // señal y hay que decirlo antes de que el usuario toque «Crear ruta del día».
  const online = useNetworkStatus();
  const canUseRoutes = isGestorCobro();
  const [routes, setRoutes] = useState<CollectionRouteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setRoutes(await fetchMyCollectionRoutes());
    } catch (e: any) {
      setError(errorMessage(e, 'No fue posible cargar las rutas'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (rolesLoading) return;
    if (!canUseRoutes) {
      setLoading(false);
      return;
    }
    load();
  }, [canUseRoutes, load, rolesLoading]));

  if (rolesLoading || (canUseRoutes && loading)) return <View style={styles.center}><ActivityIndicator color={colors.primary.main} /></View>;
  if (!canUseRoutes) return <View style={styles.center}><MaterialIcons name="lock" size={44} color={colors.text.secondary} /><Text style={{ color: colors.text.primary }}>Este módulo es exclusivo para gestores de cobro.</Text></View>;

  const { today: todayRoute, unfinished, history } = groupRoutesForHome(routes, bogotaDateValue());
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

      {!online ? (
        <View style={[styles.offlineNotice, { borderColor: colors.warning.main, backgroundColor: `${colors.warning.main}1a` }]}>
          <MaterialIcons name="cloud-off" size={22} color={colors.warning.dark} />
          <Text style={{ color: colors.text.primary, flex: 1 }}>
            Sin conexión: ves las rutas descargadas en el teléfono. Para crear o editar una ruta necesitas señal.
          </Text>
        </View>
      ) : null}

      {error ? <Text style={[styles.error, { color: colors.error.main }]}>{error}</Text> : null}

      {todayRoute ? (
        <RouteCard route={todayRoute} title="Ruta de hoy" colors={colors} onPress={() => router.push(`/ruta-cobros/${todayRoute.id}` as any)} />
      ) : (
        <TouchableOpacity
          disabled={!online}
          accessibilityState={{ disabled: !online }}
          style={[styles.createCard, { backgroundColor: colors.background.paper, borderColor: online ? colors.primary.main : colors.divider, opacity: online ? 1 : 0.6 }]}
          onPress={() => router.navigate('/(tabs)/ruta-cobros-crear' as any)}>
          <MaterialIcons name="add-road" size={38} color={online ? colors.primary.main : colors.text.secondary} />
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Crear ruta del día</Text>
          <Text style={{ color: colors.text.secondary, textAlign: 'center' }}>
            {online ? 'Elige entre todos tus negocios asignados y ordena las visitas.' : 'Necesitas conexión para crear la ruta del día.'}
          </Text>
        </TouchableOpacity>
      )}

      {unfinished.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          title={`Ruta del ${routeDateLabel(route.route_date)} sin cerrar`}
          hint="Complétala o cancélala para que no quede abierta."
          colors={colors}
          onPress={() => router.push(`/ruta-cobros/${route.id}` as any)}
        />
      ))}

      <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Historial reciente</Text>
      {history.length === 0 ? <Text style={{ color: colors.text.secondary }}>Aún no hay rutas anteriores.</Text> : null}
      {history.map((route) => (
        <TouchableOpacity key={route.id} style={[styles.historyCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]} onPress={() => router.push(`/ruta-cobros/${route.id}` as any)}>
          <MaterialIcons name={route.status === 'completada' ? 'check-circle' : 'cancel'} size={24} color={route.status === 'completada' ? colors.success.main : colors.text.secondary} />
          <View style={{ flex: 1 }}><Text style={{ color: colors.text.primary, fontWeight: '800' }}>{routeDateLabel(route.route_date)}</Text><Text style={{ color: colors.text.secondary }}>{route.completed_count}/{route.stop_count} visitas{notVisitedSuffix(route)} · {money(route.collected_total)}</Text></View>
          <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{statusLabel[route.status]}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

/**
 * En una ruta completada, las paradas que no son visitas quedaron «No
 * visitada» al cerrar la jornada.
 */
function notVisitedSuffix(route: CollectionRouteSummary) {
  const notVisited = route.status === 'completada' ? route.stop_count - route.completed_count : 0;
  return notVisited > 0 ? ` · ${notVisited} no ${notVisited === 1 ? 'visitada' : 'visitadas'}` : '';
}

function RouteCard({
  route,
  title,
  hint,
  colors,
  onPress,
}: {
  route: CollectionRouteSummary;
  title: string;
  hint?: string;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
}) {
  const running = route.status === 'activa';
  const done = route.status === 'completada';
  const icon = done ? 'check-circle' : running ? 'near-me' : 'edit-road';
  const tint = done ? colors.success.main : running ? colors.primary.main : colors.text.secondary;
  return (
    <TouchableOpacity accessibilityRole="button" style={[styles.activeCard, { backgroundColor: colors.background.paper }]} onPress={onPress}>
      <View style={styles.rowBetween}>
        <View style={[styles.iconCircle, { backgroundColor: `${tint}22` }]}>
          <MaterialIcons name={icon} size={26} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{title}</Text>
          <Text style={{ color: colors.text.secondary }}>{statusLabel[route.status]} · {route.completed_count}/{route.stop_count} visitas{notVisitedSuffix(route)}</Text>
          {hint ? <Text style={{ color: colors.warning.dark, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
        </View>
        <MaterialIcons name="chevron-right" size={28} color={colors.text.secondary} />
      </View>
      <View style={[styles.metrics, { borderTopColor: colors.divider }]}>
        <View><Text style={[styles.metricLabel, { color: colors.text.secondary }]}>Esperado</Text><Text style={[styles.metricValue, { color: colors.text.primary }]}>{money(route.expected_total)}</Text></View>
        <View><Text style={[styles.metricLabel, { color: colors.text.secondary }]}>Recaudado</Text><Text style={[styles.metricValue, { color: colors.success.main }]}>{money(route.collected_total)}</Text></View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40, gap: 14 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  hero: { borderRadius: 22, padding: 20, flexDirection: 'row', alignItems: 'center' }, eyebrow: { color: '#bfdbfe', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, title: { color: '#fff', fontWeight: '900', fontSize: 24, marginTop: 4 }, subtitle: { color: '#dbeafe', marginTop: 5, lineHeight: 19 },
  error: { padding: 12, borderRadius: 10 }, offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: 12 }, activeCard: { borderRadius: 18, padding: 16, elevation: 2 }, createCard: { borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', padding: 26, alignItems: 'center', gap: 8 }, rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 }, iconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }, cardTitle: { fontSize: 17, fontWeight: '900' }, metrics: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#cbd5e1', paddingTop: 14, marginTop: 14 }, metricLabel: { color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: '700' }, metricValue: { fontSize: 16, fontWeight: '900', marginTop: 3 }, sectionTitle: { fontSize: 17, fontWeight: '900', marginTop: 8 }, historyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
});
