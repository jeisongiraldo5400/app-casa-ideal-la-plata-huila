import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { HeroActionCard, ScreenErrorBoundary, ScreenState, SearchField, SegmentedControl } from '@/components/ui';
import { CatalogListCard, useCatalogAccess, useCatalogosStore } from '@/components/catalogos';
import {
  CATALOG_LIST_FILTERS,
  matchesCatalogListFilter,
  matchesCatalogListQuery,
  normalizeCatalogQuery,
  type CatalogListFilter,
} from '@/lib/catalogos/catalogListFilters';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';

export default function CatalogosScreen() {
  return (
    <ScreenErrorBoundary screen="Catálogos">
      <CatalogosScreenInner />
    </ScreenErrorBoundary>
  );
}

function CatalogosScreenInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { list, loading, error, fetchList } = useCatalogosStore();
  const access = useCatalogAccess();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CatalogListFilter>('all');

  useFocusEffect(
    useCallback(() => {
      if (access.canAccessCatalogs) void fetchList();
    }, [fetchList, access.canAccessCatalogs])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchList();
    setRefreshing(false);
  };

  const normalizedQuery = normalizeCatalogQuery(query);
  const filtered = useMemo(
    () => list.filter((item) => matchesCatalogListFilter(item, filter) && matchesCatalogListQuery(item, normalizedQuery)),
    [list, filter, normalizedQuery]
  );
  const hasFilters = filter !== 'all' || normalizedQuery.length > 0;
  const initialLoading = loading && !refreshing && list.length === 0;

  if (!access.loading && !access.canAccessCatalogs) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background.default }]}>
        <ScreenState icon="lock-outline" title="Sin acceso" description="Tu usuario no tiene un rol de catálogo. Pídelo a un administrador." />
      </View>
    );
  }

  const renderEmpty = () => {
    if (initialLoading) return <ScreenState loading title="Cargando catálogos…" variant="inline" />;
    if (error && list.length === 0) {
      const offline = isNetworkError(error);
      return (
        <ScreenState
          tone="error"
          icon={offline ? 'cloud-off' : 'inbox'}
          title={offline ? 'Sin conexión' : 'No se pudieron cargar los catálogos'}
          description={offline ? 'Los catálogos requieren internet. Revisa la conexión e inténtalo de nuevo.' : error}
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
          description="Ningún catálogo coincide con la búsqueda o el filtro."
          actionLabel="Limpiar filtros"
          onAction={() => {
            setQuery('');
            setFilter('all');
          }}
        />
      );
    }
    return (
      <ScreenState
        icon="auto-stories"
        title="Aún no hay catálogos"
        description={access.canManageCatalog ? 'Crea el primero y compártelo con un cliente por enlace.' : 'Cuando el equipo publique catálogos aparecerán aquí.'}
        actionLabel={access.canManageCatalog ? 'Nuevo catálogo' : undefined}
        onAction={access.canManageCatalog ? () => router.navigate('/(tabs)/catalogo-create' as never) : undefined}
      />
    );
  };

  const header = (
    <View style={styles.header}>
      {access.canManageCatalog ? (
        <HeroActionCard
          compact
          title="Nuevo catálogo"
          subtitle="Elige productos y comparte por enlace"
          icon="auto-stories"
          onPress={() => router.navigate('/(tabs)/catalogo-create' as never)}
        />
      ) : null}
      <SearchField value={query} onChangeText={setQuery} placeholder="Buscar por nombre o título" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
      <SegmentedControl items={CATALOG_LIST_FILTERS} value={filter} onChange={(value) => setFilter(value as CatalogListFilter)} />
      {error && list.length > 0 ? (
        <Text style={[styles.notice, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
          No se pudo actualizar. Mostrando la última lista cargada.
        </Text>
      ) : null}
      {!initialLoading && list.length > 0 ? (
        <Text style={[styles.count, { color: colors.text.secondary }]}>
          {filtered.length} de {list.length} catálogo{list.length === 1 ? '' : 's'}
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
        renderItem={({ item }) => <CatalogListCard item={item} onPress={() => router.push(`/catalogo/${item.id}` as never)} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  header: { gap: Spacing.md, marginBottom: Spacing.lg },
  notice: { ...Typography.metadata },
  count: { ...Typography.metadata, textAlign: 'right' },
  separator: { height: Spacing.md },
});
