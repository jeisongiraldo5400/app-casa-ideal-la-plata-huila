import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { DownloadDataButton } from '@/components/offline';
import { ScreenErrorBoundary, ScreenState, SearchField, SegmentedControl } from '@/components/ui';
import { NegocioListCard } from '@/components/negocios/components/NegocioListCard';
import { useNegociosStore } from '@/components/negocios/infrastructure/store/negociosStore';
import {
  NEGOCIO_LIST_FILTERS,
  matchesNegocioListFilter,
  matchesNegocioListQuery,
  type NegocioListFilter,
} from '@/lib/negocios/negocioListFilters';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';

export default function MisNegociosScreen() {
  return (
    <ScreenErrorBoundary screen="Mis negocios">
      <MisNegociosScreenInner />
    </ScreenErrorBoundary>
  );
}

function MisNegociosScreenInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const { myList: list, myLoading: loading, myFromCache: fromCache, myError: error, fetchMyList } =
    useNegociosStore();
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NegocioListFilter>('all');
  const sellerId = user?.id;

  const loadMyList = useCallback(() => {
    if (sellerId) void fetchMyList(sellerId);
  }, [fetchMyList, sellerId]);

  useFocusEffect(
    useCallback(() => {
      loadMyList();
    }, [loadMyList])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    loadMyList();
    setRefreshing(false);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      list.filter(
        (item) => matchesNegocioListFilter(item, filter) && matchesNegocioListQuery(item, normalizedQuery)
      ),
    [list, filter, normalizedQuery]
  );
  const hasFilters = filter !== 'all' || normalizedQuery.length > 0;
  const initialLoading = loading && !refreshing && list.length === 0;

  const renderEmpty = () => {
    if (initialLoading) {
      return <ScreenState loading title="Cargando tus negocios…" variant="inline" />;
    }
    if (error && list.length === 0) {
      return (
        <ScreenState
          tone="error"
          title="No se pudieron cargar tus negocios"
          description={error}
          actionLabel="Reintentar"
          onAction={loadMyList}
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
          }}
        />
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
        title="Aún no tienes negocios"
        description="Los negocios donde figures como vendedor aparecerán aquí."
      />
    );
  };

  const header = (
    <View style={styles.header}>
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
      {!initialLoading && list.length > 0 ? (
        <Text style={[styles.count, { color: colors.text.secondary }]}>
          {filtered.length} de {list.length} negocio{list.length === 1 ? '' : 's'}
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
        renderItem={({ item }) => (
          <NegocioListCard item={item} onPress={() => router.push(`/negocio/${item.id}`)} />
        )}
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
