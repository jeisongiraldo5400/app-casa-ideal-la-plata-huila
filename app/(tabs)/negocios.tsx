import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { DownloadDataButton } from '@/components/offline';
import { NotOnPhoneNotice } from '@/components/offline/NotOnPhoneNotice';
import {
  HeroActionCard,
  ScreenErrorBoundary,
  ScreenState,
  SearchField,
  SegmentedControl,
} from '@/components/ui';
import { NegocioListCard } from '@/components/negocios/components/NegocioListCard';
import { useNegocioSyncOverlay } from '@/components/negocios/infrastructure/hooks/useNegocioSyncOverlay';
import { useNegociosStore } from '@/components/negocios/infrastructure/store/negociosStore';
import {
  NEGOCIO_LIST_FILTERS,
  matchesNegocioListFilter,
  matchesNegocioListQuery,
  type NegocioListFilter,
} from '@/lib/negocios/negocioListFilters';
import { negocioCardOpensSyncQueue, withUnsyncedNegociosFirst } from '@/lib/negocios/negocioSyncBadge';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useScreenLoading } from '@/hooks/useScreenLoading';

/** Espera a que el usuario deje de escribir antes de consultar al servidor. */
const SEARCH_DEBOUNCE_MS = 350;

export default function NegociosScreen() {
  return (
    <ScreenErrorBoundary screen="Negocios">
      <NegociosScreenInner />
    </ScreenErrorBoundary>
  );
}

function NegociosScreenInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { list, loading, fromCache, error, fetchList } = useNegociosStore();
  const { isAdmin, isVendedor, isGestorCobro, onlyFindsBySearch } = useUserRoles();
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const setQueueVisible = useSyncStore((state) => state.setQueueVisible);
  // Negocios creados en el teléfono sin confirmar: distintivo en la tarjeta.
  const syncOverlay = useNegocioSyncOverlay();
  const canCreate = isAdmin() || isVendedor() || isGestorCobro();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NegocioListFilter>('all');
  // El recaudador cobra en cualquier negocio, pero no recorre la lista: llega
  // a uno buscándolo (20261125120000).
  const searchOnly = onlyFindsBySearch();
  // Publica la carga de esta pantalla al aviso global (components/ui/GlobalLoadingBar).
  useScreenLoading(loading);


  // La búsqueda la resuelve el servidor (el teléfono sólo tiene las últimas 50
  // filas): se espera a que el usuario deje de escribir para no consultar por
  // cada tecla.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      // Sin término no se pide la lista: el recaudador no tiene listado que ver.
      if (searchOnly && debouncedQuery.length === 0) return;
      fetchList(debouncedQuery);
    }, [fetchList, debouncedQuery, searchOnly])
  );

  const onRefresh = async () => {
    if (searchOnly && debouncedQuery.length === 0) return;
    setRefreshing(true);
    await fetchList(debouncedQuery);
    setRefreshing(false);
  };

  // Con señal la lista viene del servidor, que no conoce los negocios aún sin
  // confirmar: se añaden desde el teléfono y van arriba en ambos casos. El
  // recaudador no crea negocios ni recorre la lista.
  const fullList = useMemo(
    () => (searchOnly ? list : withUnsyncedNegociosFirst(list, syncOverlay.items, syncOverlay.states)),
    [list, searchOnly, syncOverlay]
  );
  const normalizedQuery = query.trim();
  const filtered = useMemo(
    () =>
      fullList.filter(
        (item) => matchesNegocioListFilter(item, filter) && matchesNegocioListQuery(item, normalizedQuery)
      ),
    [fullList, filter, normalizedQuery]
  );
  const hasFilters = filter !== 'all' || normalizedQuery.length > 0;
  const initialLoading = loading && !refreshing && fullList.length === 0;

  const renderEmpty = () => {
    if (searchOnly && normalizedQuery.length === 0) {
      return (
        <ScreenState
          icon="search"
          title="Busca el negocio que vas a cobrar"
          description="Escribe su número o la cédula del cliente. No se muestra la lista completa de negocios."
        />
      );
    }
    if (initialLoading) {
      return <ScreenState loading title="Cargando negocios…" variant="inline" />;
    }
    if (error && list.length === 0) {
      return (
        <ScreenState
          tone="error"
          title="No se pudieron cargar los negocios"
          description={error}
          actionLabel="Reintentar"
          onAction={() => void fetchList()}
        />
      );
    }
    if (hasFilters) {
      return (
        <ScreenState
          icon="filter-list-off"
          title="Sin coincidencias"
          description="Ningún negocio coincide con la búsqueda o el filtro."
          actionLabel="Limpiar filtros"
          onAction={() => {
            setQuery('');
            setFilter('all');
          }}>
          <NotOnPhoneNotice fromCache={fromCache} />
        </ScreenState>
      );
    }
    if (fromCache) {
      return (
        <ScreenState
          icon="cloud-off"
          title="Sin datos locales"
          description="Conéctese y descargue la información para trabajar sin conexión.">
          <DownloadDataButton variant="cta" />
        </ScreenState>
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
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por código o cliente"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <SegmentedControl
        items={NEGOCIO_LIST_FILTERS}
        value={filter}
        onChange={(value) => setFilter(value as NegocioListFilter)}
      />
      {fromCache ? (
        <Text style={[styles.notice, { color: colors.text.secondary }]}>{formatLocalDataLabel(lastSyncedAt)}</Text>
      ) : null}
      {error && list.length > 0 ? (
        <Text style={[styles.notice, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
          No se pudo actualizar. Mostrando la última lista cargada.
        </Text>
      ) : null}
      {!initialLoading && fullList.length > 0 ? (
        <Text style={[styles.count, { color: colors.text.secondary }]}>
          {filtered.length} de {fullList.length} negocio{fullList.length === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty()}
        renderItem={({ item }) => {
          const syncState = syncOverlay.states[item.id];
          return (
            <NegocioListCard
              item={item}
              syncState={syncState}
              onPress={() =>
                // Rechazado: se decide en «Cambios sin sincronizar» (motivo,
                // reintentar o descartar). Pendiente con señal: la ficha
                // consultaría al servidor, que aún no lo conoce.
                negocioCardOpensSyncQueue(syncState, !fromCache)
                  ? setQueueVisible(true)
                  : router.push(`/negocio/${item.id}`)
              }
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  header: { gap: Spacing.md, marginBottom: Spacing.lg },
  notice: { ...Typography.metadata },
  count: { ...Typography.metadata, textAlign: 'right' },
  separator: { height: Spacing.md },
});
