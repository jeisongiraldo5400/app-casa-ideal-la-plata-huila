import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, useFocusEffect, useRouter } from 'expo-router';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { BackButton, ScreenErrorBoundary, ScreenState, SearchField } from '@/components/ui';
import { CatalogListCard, useCatalogAccess, useCatalogosStore } from '@/components/catalogos';
import { groupCatalogsByOwner, matchesCatalogListQuery, normalizeCatalogQuery, splitCatalogList } from '@/lib/catalogos/catalogListFilters';
import { isQuickShareCatalog } from '@/lib/catalogos/quickShare';
import { fetchProfileNames } from '@/lib/profileNames';

export default function CatalogosEquipoScreen() {
  // Módulo oculto en esta versión (constants/features.ts).
  if (!CATALOGOS_HABILITADOS) return <Redirect href="/(tabs)" />;
  return (
    <ScreenErrorBoundary screen="Catálogos del equipo">
      <CatalogosEquipoInner />
    </ScreenErrorBoundary>
  );
}

/**
 * «Catálogos del equipo»: lo que crearon OTRAS personas, aparte de la pestaña
 * Catálogos (que solo muestra lo propio) y agrupado por quien lo creó.
 *
 * Qué aparece lo decide la RLS: al administrador, todo; a los demás, lo que un
 * administrador publicó al equipo o alguien compartió con ellos. Los envíos de
 * un producto de otras personas no se listan aquí (se ven en el panel web).
 */
function CatalogosEquipoInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const access = useCatalogAccess();
  const { list, loading, error, fetchList } = useCatalogosStore();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());

  useFocusEffect(
    useCallback(() => {
      if (access.canAccessCatalogs) void fetchList();
    }, [fetchList, access.canAccessCatalogs])
  );

  const others = useMemo(() => splitCatalogList(list).others, [list]);
  const editions = useMemo(() => others.filter((item) => !isQuickShareCatalog(item.internalTitle)), [others]);
  const hiddenQuickShares = others.length - editions.length;
  const ownerKey = useMemo(() => [...new Set(editions.map((item) => item.ownerId))].sort().join(','), [editions]);

  // Nombres de quienes los crearon. Si fallan, se agrupa igual («Usuario sin nombre»).
  useEffect(() => {
    if (!ownerKey) return;
    let active = true;
    fetchProfileNames(ownerKey.split(','))
      .then((result) => {
        if (active) setNames(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ownerKey]);

  const normalizedQuery = normalizeCatalogQuery(query);
  const sections = useMemo(() => {
    const visible = editions.filter(
      (item) =>
        matchesCatalogListQuery(item, normalizedQuery) ||
        normalizeCatalogQuery(names.get(item.ownerId) ?? '').includes(normalizedQuery)
    );
    return groupCatalogsByOwner(visible, names);
  }, [editions, names, normalizedQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchList({ force: true });
    setRefreshing(false);
  };

  const screenOptions = { title: 'Catálogos del equipo', headerLeft: () => <BackButton /> };
  const initialLoading = loading && !refreshing && list.length === 0;

  const renderEmpty = () => {
    if (initialLoading) return <ScreenState loading title="Cargando catálogos…" variant="inline" />;
    if (error && list.length === 0) {
      return (
        <ScreenState
          tone="error"
          icon="inbox"
          title="No se pudieron cargar los catálogos"
          description={error}
          actionLabel="Reintentar"
          onAction={() => void fetchList({ force: true })}
        />
      );
    }
    if (normalizedQuery) {
      return <ScreenState icon="filter-list-off" title="Sin coincidencias" description="Ningún catálogo ni persona coincide con la búsqueda." />;
    }
    return (
      <ScreenState
        icon="groups"
        title="No hay catálogos de otras personas"
        description="Aquí aparecen los que un administrador publica al equipo o alguien comparte contigo."
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.hint, { color: colors.text.secondary }]}>
              Lo que crearon otras personas. Tus catálogos siguen en la pestaña Catálogos.
            </Text>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar catálogo o persona"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.owner, { color: colors.text.primary }]}>
            {section.ownerName} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => <CatalogListCard item={item} onPress={() => router.push(`/catalogo/${item.id}` as never)} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={
          hiddenQuickShares > 0 ? (
            <Text style={[styles.footnote, { color: colors.text.tertiary }]}>
              {hiddenQuickShares === 1
                ? '1 envío de un producto de otras personas se ve en el panel web.'
                : `${hiddenQuickShares} envíos de un producto de otras personas se ven en el panel web.`}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  header: { gap: Spacing.md, marginBottom: Spacing.sm },
  hint: { ...Typography.bodySmall },
  owner: { ...Typography.bodyStrong, fontWeight: '800', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  separator: { height: Spacing.md },
  footnote: { ...Typography.caption, marginTop: Spacing.xl, textAlign: 'center' },
});
