import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { Button, HeroActionCard, ScreenErrorBoundary, ScreenState, SearchField, SegmentedControl } from '@/components/ui';
import { CatalogListCard, useCatalogAccess, useCatalogosStore } from '@/components/catalogos';
import {
  CATALOG_LIST_FILTERS,
  matchesCatalogListFilter,
  matchesCatalogListQuery,
  normalizeCatalogQuery,
  type CatalogListFilter,
} from '@/lib/catalogos/catalogListFilters';
import { isOfflineError } from '@/lib/errorMessage';

export default function CatalogosScreen() {
  // Módulo oculto en esta versión: ni siquiera se monta la pantalla, así que no
  // se piden catálogos al servidor (constants/features.ts).
  if (!CATALOGOS_HABILITADOS) return <Redirect href="/(tabs)" />;
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

  // Al volver a la pestaña solo se recarga si pasaron 30 s o hubo cambios.
  useFocusEffect(
    useCallback(() => {
      if (access.canAccessCatalogs) void fetchList();
    }, [fetchList, access.canAccessCatalogs])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchList({ force: true });
    setRefreshing(false);
  };
  const openCreate = () => router.navigate('/(tabs)/catalogo-create' as never);

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
      // `error` ya viene traducido por el store: `isNetworkError` buscaba las
      // palabras en inglés y este estado nunca se mostraba.
      const offline = isOfflineError(error);
      return (
        <ScreenState
          tone="error"
          icon={offline ? 'cloud-off' : 'inbox'}
          title={offline ? 'Sin conexión' : 'No se pudieron cargar los catálogos'}
          description={offline ? 'Los catálogos requieren internet. Revisa la conexión e inténtalo de nuevo.' : error}
          actionLabel="Reintentar"
          onAction={() => void fetchList({ force: true })}
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
        onAction={access.canManageCatalog ? openCreate : undefined}
      />
    );
  };

  const header = (
    <View style={styles.header}>
      {/* Lo más común es mandar UN producto: 4 de cada 5 ediciones en
          producción tenían uno solo. Va arriba, a un toque. */}
      {access.canManageCatalog && access.canCreateShareLink ? (
        <HeroActionCard
          compact
          title="Enviar un producto"
          subtitle="Por WhatsApp, en un paso"
          icon="send"
          onPress={() => router.push('/catalogo/enviar-producto' as never)}
        />
      ) : null}
      <View style={styles.searchRow}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar catálogo"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          containerStyle={styles.search}
        />
        {access.canManageCatalog ? <Button title="Nuevo" icon="add" size="sm" onPress={openCreate} accessibilityLabel="Nuevo catálogo" /> : null}
      </View>
      <SegmentedControl items={CATALOG_LIST_FILTERS} value={filter} onChange={(value) => setFilter(value as CatalogListFilter)} />
      {error && list.length > 0 ? (
        <Text style={[styles.notice, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
          No se pudo actualizar. Mostrando la última lista cargada.
        </Text>
      ) : null}
      {!initialLoading && hasFilters && list.length > 0 ? (
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  search: { flex: 1 },
  notice: { ...Typography.metadata },
  count: { ...Typography.metadata, textAlign: 'right' },
  separator: { height: Spacing.md },
});
