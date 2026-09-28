import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, useFocusEffect, useRouter } from 'expo-router';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { BackButton, ScreenErrorBoundary, ScreenState, SearchField } from '@/components/ui';
import { CatalogListCard, useCatalogAccess, useCatalogosStore } from '@/components/catalogos';
import { matchesCatalogListQuery, normalizeCatalogQuery, splitCatalogList } from '@/lib/catalogos/catalogListFilters';
import { isOfflineError } from '@/lib/errorMessage';

export default function CatalogosGlobalesScreen() {
  // Módulo oculto en esta versión (constants/features.ts).
  if (!CATALOGOS_HABILITADOS) return <Redirect href="/(tabs)" />;
  return (
    <ScreenErrorBoundary screen="Catálogos globales">
      <CatalogosGlobalesInner />
    </ScreenErrorBoundary>
  );
}

/**
 * «Catálogos globales»: lo que un administrador publicó para todos, de OTRAS
 * personas. Para todo el que entra al módulo (decisión del usuario,
 * 2026-09-28): se abre, se ve cómo queda y se envía por WhatsApp; no se edita.
 * Aparte de la pestaña Catálogos (solo lo propio) para no confundirlos.
 */
function CatalogosGlobalesInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const access = useCatalogAccess();
  const { list, loading, error, fetchList } = useCatalogosStore();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (access.canAccessCatalogs) void fetchList();
    }, [fetchList, access.canAccessCatalogs])
  );

  const globals = useMemo(() => splitCatalogList(list).globals, [list]);
  const normalizedQuery = normalizeCatalogQuery(query);
  const visible = useMemo(() => globals.filter((item) => matchesCatalogListQuery(item, normalizedQuery)), [globals, normalizedQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchList({ force: true });
    setRefreshing(false);
  };

  if (!access.loading && !access.canAccessCatalogs) return <Redirect href="/(tabs)" />;

  const screenOptions = { title: 'Catálogos globales', headerLeft: () => <BackButton /> };
  const initialLoading = loading && !refreshing && list.length === 0;

  const renderEmpty = () => {
    if (initialLoading) return <ScreenState loading title="Cargando catálogos…" variant="inline" />;
    if (error && list.length === 0) {
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
    if (normalizedQuery) {
      return <ScreenState icon="filter-list-off" title="Sin coincidencias" description="Ningún catálogo coincide con la búsqueda." />;
    }
    return (
      <ScreenState
        icon="public"
        title="Aún no hay catálogos globales"
        description="Cuando un administrador publique un catálogo como global, aparecerá aquí."
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.hint, { color: colors.text.secondary }]}>
              Publicados por un administrador para todos. Ábrelos y envíalos a tus clientes.
            </Text>
            {globals.length > 0 ? (
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar catálogo"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => <CatalogListCard item={item} onPress={() => router.push(`/catalogo/${item.id}` as never)} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={renderEmpty()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  header: { gap: Spacing.md, marginBottom: Spacing.lg },
  hint: { ...Typography.bodySmall },
  separator: { height: Spacing.md },
});
