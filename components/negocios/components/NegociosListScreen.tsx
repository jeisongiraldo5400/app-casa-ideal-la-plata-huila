import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { CollectionManagerPicker } from '@/components/cartera/CollectionManagerPicker';
import { DownloadDataButton } from '@/components/offline';
import { NotOnPhoneNotice } from '@/components/offline/NotOnPhoneNotice';
import { useTheme } from '@/components/theme';
import {
  Button,
  HeroActionCard,
  ScreenState,
  SearchField,
  SegmentedControl,
} from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { useScreenLoading } from '@/hooks/useScreenLoading';
import { useUserRoles } from '@/hooks/useUserRoles';
import { formatCOP } from '@/lib/creditCalculator';
import { EMPTY_LOCATION_MASTERS, type LocationMasters } from '@/lib/locations/locationsService';
import {
  availableNegociosScopes,
  countActiveNegociosFilters,
  DEFAULT_NEGOCIOS_LIST_FILTERS,
  initialNegociosScope,
  NEGOCIOS_SCOPE_LABEL,
  type NegociosListFilters,
  type NegociosListSummary,
  type NegociosScope,
} from '@/lib/negocios/negociosListQuery';
import { negocioCardOpensSyncQueue, withUnsyncedNegociosFirst } from '@/lib/negocios/negocioSyncBadge';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNegocioSyncOverlay } from '../infrastructure/hooks/useNegocioSyncOverlay';
import { useNegociosList } from '../infrastructure/hooks/useNegociosList';
import { useNegociosProducts } from '../infrastructure/hooks/useNegociosProducts';
import { loadLocationMastersForList } from '../infrastructure/services/negociosListService';
import { NegocioListCard } from './NegocioListCard';
import { NegociosFilterSheet } from './NegociosFilterSheet';

/** Espera a que el usuario deje de escribir antes de consultar. */
export const SEARCH_DEBOUNCE_MS = 350;

type Colors = ReturnType<typeof getColors>;
type Gestor = { id: string; name: string };

const SEARCH_PLACEHOLDER = 'Buscar por cliente, cédula o número';

/**
 * Negocios: una sola lista con pestañas de alcance (Todos, Míos, Por cobrar)
 * según el rol, buscador, filtros de ubicación/estado/cobro, orden y resumen
 * de lo filtrado. Con señal pregunta al servidor (`list_negocios_movil`);
 * sin señal filtra la base del teléfono con las mismas reglas.
 */
export function NegociosListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ alcance?: string }>();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { isAdmin, isVendedor, isGestorCobro, isRecaudador } = useUserRoles();
  const admin = isAdmin();
  const vendedor = isVendedor();
  const gestorCobro = isGestorCobro();
  const recaudador = isRecaudador();
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const online = useSyncStore((state) => state.online);
  const setQueueVisible = useSyncStore((state) => state.setQueueVisible);
  const syncOverlay = useNegocioSyncOverlay();
  const canCreate = admin || vendedor || gestorCobro;

  const roleFlags = useMemo(
    () => ({ isAdmin: admin, isVendedor: vendedor, isGestorCobro: gestorCobro, isRecaudador: recaudador }),
    [admin, vendedor, gestorCobro, recaudador]
  );
  const scopes = useMemo(() => availableNegociosScopes(roleFlags), [roleFlags]);
  const requestedScope = typeof params.alcance === 'string' ? params.alcance : null;
  const [scope, setScope] = useState<NegociosScope>(() => initialNegociosScope(scopes, roleFlags, requestedScope));
  const [scopeTouched, setScopeTouched] = useState(false);

  // Los roles llegan después del primer render; mientras el usuario no haya
  // elegido pestaña, se recalcula la inicial. Una ruta con ?alcance= (p. ej.
  // la antigua «Mis negocios») siempre manda.
  useEffect(() => {
    if (requestedScope && (scopes as string[]).includes(requestedScope)) {
      setScope(requestedScope as NegociosScope);
      return;
    }
    if (!scopeTouched || !scopes.includes(scope)) {
      setScope(initialNegociosScope(scopes, roleFlags, null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedScope, scopes, roleFlags]);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const [filters, setFilters] = useState<NegociosListFilters>(DEFAULT_NEGOCIOS_LIST_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [masters, setMasters] = useState<LocationMasters>(EMPTY_LOCATION_MASTERS);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [gestor, setGestor] = useState<Gestor | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Regla del usuario (2026-09-25): admin y recaudador ven todos los negocios
  // en «Todos»; ya no es «solo lo que busque» aquí (Cartera sigue igual).
  const searchOnly = false;
  // El admin que no es gestor tiene que elegir de quién es la cartera.
  const needsGestor = scope === 'por_cobrar' && admin && !gestorCobro && !gestor;

  const list = useNegociosList({
    scope,
    gestorId: scope === 'por_cobrar' ? gestor?.id ?? null : null,
    search: debouncedQuery,
    filters,
    userId,
    searchOnly,
    enabled: !needsGestor,
    online,
  });
  useScreenLoading(list.loading);

  const { reload } = list;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  // Los maestros de ubicación se piden la primera vez que se abre el filtro.
  const openFilters = useCallback(() => {
    setFiltersVisible(true);
    if (masters.departamentos.length || mastersLoading) return;
    setMastersLoading(true);
    loadLocationMastersForList()
      .then(setMasters)
      .catch(() => setMasters(EMPTY_LOCATION_MASTERS))
      .finally(() => setMastersLoading(false));
  }, [masters.departamentos.length, mastersLoading]);

  const activeFilters = countActiveNegociosFilters(filters);
  const hasFilters = activeFilters > 0 || query.trim().length > 0;
  const clearAll = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setFilters((prev) => ({ ...DEFAULT_NEGOCIOS_LIST_FILTERS, order: prev.order }));
  }, []);

  // Negocios creados en el teléfono sin confirmar: el servidor no los conoce,
  // se añaden arriba en la lista sin filtrar. También en «Por cobrar» propio:
  // un gestor sin otro rol solo tiene esa pestaña y, si no, no vería el
  // negocio que acaba de crear sin señal (aún no tiene gestor asignado). No
  // cuando el admin mira la cartera de otro gestor.
  const rows = useMemo(() => {
    if (searchOnly || hasFilters || (scope === 'por_cobrar' && gestor)) return list.rows as any[];
    return withUnsyncedNegociosFirst<any>(list.rows, syncOverlay.items, syncOverlay.states);
  }, [gestor, hasFilters, list.rows, scope, searchOnly, syncOverlay]);

  // Productos de las tarjetas visibles: una consulta por página, no por tarjeta.
  const products = useNegociosProducts(rows.map((row: { id: string }) => row.id));

  const onRefresh = async () => {
    setRefreshing(true);
    products.refresh();
    await reload();
    setRefreshing(false);
  };

  const initialLoading = list.loading && !refreshing && list.rows.length === 0;

  const renderEmpty = () => {
    if (needsGestor) {
      return (
        <ScreenState
          icon="person-search"
          title="Elige un gestor de cobro"
          description="Verás los negocios que tiene asignados para cobrar."
          actionLabel="Elegir gestor"
          onAction={() => setPickerVisible(true)}
        />
      );
    }
    if (searchOnly && !query.trim()) {
      return (
        <ScreenState
          icon="search"
          title="Busca el negocio que vas a cobrar"
          description="Escribe su número o la cédula del cliente. No se muestra la lista completa de negocios."
        />
      );
    }
    if (initialLoading) return <ScreenState loading title="Cargando negocios…" variant="inline" />;
    if (list.error && list.rows.length === 0) {
      return (
        <ScreenState
          tone="error"
          title="No se pudieron cargar los negocios"
          description={list.error}
          actionLabel="Reintentar"
          onAction={() => void reload()}
        />
      );
    }
    if (hasFilters) {
      return (
        <ScreenState
          icon="filter-list-off"
          title="Sin coincidencias"
          description="Ningún negocio coincide con la búsqueda o los filtros."
          actionLabel="Limpiar filtros"
          onAction={clearAll}>
          <NotOnPhoneNotice fromCache={list.fromCache} />
        </ScreenState>
      );
    }
    if (list.fromCache) {
      return (
        <ScreenState
          icon="cloud-off"
          title="Sin datos locales"
          description="Conéctese y descargue la información para trabajar sin conexión.">
          <DownloadDataButton variant="cta" />
        </ScreenState>
      );
    }
    if (scope === 'por_cobrar') {
      return (
        <ScreenState
          icon="payments"
          title="Sin negocios por cobrar"
          description="Los negocios que te asignen para cobrar aparecerán aquí."
        />
      );
    }
    if (scope === 'mios') {
      return (
        <ScreenState
          icon="handshake"
          title="Aún no tienes negocios"
          description="Los negocios donde figures como vendedor o que registres aparecerán aquí."
        />
      );
    }
    return (
      <ScreenState
        icon="handshake"
        title="Aún no hay negocios"
        description={canCreate ? 'Crea el primero para empezar a gestionar créditos.' : 'Cuando se registren negocios aparecerán aquí.'}
        actionLabel={canCreate ? 'Crear negocio' : undefined}
        onAction={canCreate ? () => router.navigate('/(tabs)/negocio-create') : undefined}
      />
    );
  };

  const header = (
    <View style={styles.header}>
      {canCreate ? (
        <HeroActionCard
          compact
          title="Nuevo negocio"
          subtitle="Crédito y orden de entrega"
          icon="add-business"
          onPress={() => router.navigate('/(tabs)/negocio-create')}
        />
      ) : null}
      {scopes.length > 1 ? (
        <SegmentedControl
          items={scopes.map((value) => ({ value, label: NEGOCIOS_SCOPE_LABEL[value] }))}
          value={scope}
          onChange={(value) => {
            setScopeTouched(true);
            setScope(value as NegociosScope);
          }}
        />
      ) : null}
      {scope === 'por_cobrar' && admin ? (
        <GestorRow gestor={gestor} selfIsGestor={gestorCobro} onPick={() => setPickerVisible(true)} onClear={() => setGestor(null)} colors={colors} />
      ) : null}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={SEARCH_PLACEHOLDER}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <FilterBar activeCount={activeFilters} canClear={hasFilters} onOpen={openFilters} onClear={clearAll} colors={colors} />
      {list.fromCache ? (
        <Text style={[styles.notice, { color: colors.text.secondary }]}>{formatLocalDataLabel(lastSyncedAt)}</Text>
      ) : null}
      {list.error && list.rows.length > 0 ? (
        <Text style={[styles.notice, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
          No se pudo actualizar. Mostrando la última lista cargada.
        </Text>
      ) : null}
      {!initialLoading && !needsGestor && list.summary.totalCount > 0 ? (
        <SummaryRow summary={list.summary} colors={colors} />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={needsGestor || (searchOnly && !query.trim()) ? [] : rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary.main} /> : null}
        onEndReachedThreshold={0.5}
        onEndReached={() => void list.loadMore()}
        renderItem={({ item }) => {
          const syncState = syncOverlay.states[item.id];
          return (
            <NegocioListCard
              item={item}
              syncState={syncState}
              products={products.byNegocio.get(item.id)}
              onPress={() =>
                // Rechazado: se decide en «Cambios sin sincronizar». Pendiente:
                // la ficha lo muestra desde el teléfono, con o sin señal.
                negocioCardOpensSyncQueue(syncState, !list.fromCache)
                  ? setQueueVisible(true)
                  : router.push(`/negocio/${item.id}`)
              }
            />
          );
        }}
        ItemSeparatorComponent={Separator}
      />
      <NegociosFilterSheet
        visible={filtersVisible}
        scope={scope}
        value={filters}
        masters={masters}
        mastersLoading={mastersLoading}
        onApply={(next) => {
          setFilters(next);
          setFiltersVisible(false);
        }}
        onClose={() => setFiltersVisible(false)}
      />
      {admin ? (
        <CollectionManagerPicker
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSelect={(manager) => {
            setGestor({ id: manager.id, name: manager.full_name });
            setPickerVisible(false);
          }}
        />
      ) : null}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/** Botón «Filtros» con contador y «Limpiar». */
function FilterBar({
  activeCount,
  canClear,
  onOpen,
  onClear,
  colors,
}: {
  activeCount: number;
  canClear: boolean;
  onOpen: () => void;
  onClear: () => void;
  colors: Colors;
}) {
  const active = activeCount > 0;
  return (
    <View style={styles.filterBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `Filtros, ${activeCount} activos` : 'Filtros'}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.filterButton,
          {
            borderColor: active ? colors.primary.main : colors.divider,
            backgroundColor: active ? `${colors.primary.main}14` : colors.background.paper,
          },
          pressed && styles.pressed,
        ]}>
        <MaterialIcons name="tune" size={18} color={active ? colors.primary.main : colors.text.secondary} />
        <Text style={[styles.filterText, { color: active ? colors.primary.main : colors.text.primary }]}>
          Filtros{active ? ` (${activeCount})` : ''}
        </Text>
      </Pressable>
      {canClear ? <Button title="Limpiar" variant="ghost" size="sm" onPress={onClear} /> : null}
    </View>
  );
}

/** Cantidad, saldo y mora de lo filtrado (no sólo de lo cargado). */
function SummaryRow({ summary, colors }: { summary: NegociosListSummary; colors: Colors }) {
  const { totalCount, totalSaldo, moraCount } = summary;
  return (
    <View
      style={[styles.summary, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
      accessibilityLabel={`${totalCount} negocios, saldo total ${formatCOP(totalSaldo)}, ${moraCount} en mora`}>
      <SummaryItem label={totalCount === 1 ? 'Negocio' : 'Negocios'} value={String(totalCount)} colors={colors} />
      <SummaryItem label="Saldo total" value={formatCOP(totalSaldo)} colors={colors} />
      <SummaryItem label="En mora" value={String(moraCount)} colors={colors} tone={moraCount > 0 ? colors.error.main : undefined} />
    </View>
  );
}

function SummaryItem({ label, value, colors, tone }: { label: string; value: string; colors: Colors; tone?: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color: tone ?? colors.text.primary }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>{label}</Text>
    </View>
  );
}

/** Admin en «Por cobrar»: de qué gestor es la cartera que se ve. */
function GestorRow({
  gestor,
  selfIsGestor,
  onPick,
  onClear,
  colors,
}: {
  gestor: Gestor | null;
  selfIsGestor: boolean;
  onPick: () => void;
  onClear: () => void;
  colors: Colors;
}) {
  const label = gestor ? gestor.name : selfIsGestor ? 'Tú' : 'Sin elegir';
  return (
    <View style={[styles.gestorRow, { borderColor: colors.divider, backgroundColor: colors.background.paper }]}>
      <MaterialIcons name="person" size={20} color={colors.primary.main} />
      <Text style={[styles.gestorText, { color: colors.text.primary }]} numberOfLines={1}>
        Gestor: {label}
      </Text>
      {gestor && selfIsGestor ? <Button title="Ver los míos" variant="ghost" size="sm" onPress={onClear} /> : null}
      <Button title={gestor || selfIsGestor ? 'Cambiar' : 'Elegir'} variant="outline" size="sm" onPress={onPick} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  header: { gap: Spacing.md, marginBottom: Spacing.lg },
  notice: { ...Typography.metadata },
  separator: { height: Spacing.md },
  footer: { paddingVertical: Spacing.lg },
  filterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  filterButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.chip,
  },
  filterText: { ...Typography.bodySmallStrong },
  summary: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.control, paddingVertical: Spacing.sm },
  summaryItem: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.xs },
  summaryValue: { ...Typography.bodyStrong },
  summaryLabel: { ...Typography.caption },
  gestorRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.md,
  },
  gestorText: { ...Typography.bodySmallStrong, flex: 1 },
  pressed: { opacity: 0.8 },
});
