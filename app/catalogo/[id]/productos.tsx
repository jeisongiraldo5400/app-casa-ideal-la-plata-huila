import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { ActionBar, BackButton, Button, Pagination, ScreenErrorBoundary, ScreenState, SearchField } from '@/components/ui';
import { CategoryFilterField, ProductPickerRow, useCatalogDetail, useProductPicker } from '@/components/catalogos';
import type { CatalogSection } from '@/lib/catalogos/types';
import { pluralize } from '@/lib/catalogos/labels';

export default function CatalogoProductosScreen() {
  // Módulo oculto en esta versión (constants/features.ts).
  if (!CATALOGOS_HABILITADOS) return <Redirect href="/(tabs)" />;
  return (
    <ScreenErrorBoundary screen="Productos del catálogo">
      <CatalogoProductosGate />
    </ScreenErrorBoundary>
  );
}

/** Espera el detalle para conocer las categorías y productos antes de montar el selector. */
function CatalogoProductosGate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { detail, loading, error, notFound, isOwner, canShare, reload } = useCatalogDetail(id);
  const screenOptions = { title: 'Productos', headerLeft: () => <BackButton /> };

  if (loading && !detail) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          <ScreenState loading title="Cargando catálogo…" variant="inline" />
        </View>
      </View>
    );
  }
  if (!detail) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          {notFound ? (
            <ScreenState icon="search-off" title="No se encontró el catálogo" />
          ) : (
            <ScreenState tone="error" title="No se pudo cargar el catálogo" description={error ?? undefined} actionLabel="Reintentar" onAction={() => void reload()} />
          )}
        </View>
      </View>
    );
  }
  if (!isOwner) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          <ScreenState icon="lock-outline" title="Solo el autor puede editar" description="Este catálogo es del equipo. Puedes verlo, pero no cambiar su selección." />
        </View>
      </View>
    );
  }
  return <ProductPicker catalogId={detail.id} sections={detail.sections} canShare={canShare} />;
}

type ProductPickerProps = { catalogId: string; sections: CatalogSection[]; canShare: boolean };

function ProductPicker({ catalogId, sections, canShare }: ProductPickerProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const picker = useProductPicker(catalogId, sections);
  const [finishing, setFinishing] = useState(false);
  const screenOptions = { title: 'Productos', headerLeft: () => <BackButton /> };
  const categoryCount = sections.reduce((total, section) => total + section.items.filter((item) => item.itemType === 'category').length, 0);
  const selectedCount = picker.selected.size;

  // Espera las escrituras en cola para que Compartir cargue la selección definitiva.
  const finish = async () => {
    setFinishing(true);
    try {
      await picker.flush();
    } finally {
      setFinishing(false);
    }
    if (canShare) router.push(`/catalogo/${catalogId}/compartir` as never);
    else router.back();
  };

  const renderBody = () => {
    if (picker.loading && picker.items.length === 0) return <ScreenState loading title="Buscando fichas…" variant="inline" />;
    if (picker.error) {
      return <ScreenState tone="error" title="No se pudieron cargar las fichas" description={picker.error} actionLabel="Reintentar" onAction={() => void picker.reload()} />;
    }
    if (picker.items.length === 0) {
      return <ScreenState icon="search-off" title="Sin fichas publicadas" description="Ninguna ficha publicada coincide con la búsqueda o la categoría." />;
    }
    return (
      <View style={styles.list}>
        {picker.items.map((item) => (
          <ProductPickerRow
            key={item.catalogProductId}
            item={item}
            selected={picker.selected.has(item.productId)}
            pending={picker.pendingIds.has(item.productId)}
            onToggle={() => void picker.toggle(item)}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.filters}>
          <SearchField value={picker.query} onChangeText={picker.setQuery} placeholder="Buscar ficha por nombre" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
          <CategoryFilterField value={picker.categoryId} onValueChange={picker.setCategoryId} categories={picker.categories} />
          <Text style={[styles.count, { color: colors.text.secondary }]}>
            {pluralize(picker.selected.size, 'ficha seleccionada', 'fichas seleccionadas')}
            {picker.totalCount > 0 ? ` · ${pluralize(picker.totalCount, 'resultado', 'resultados')}` : ''}
          </Text>
        </View>
        {renderBody()}
        <Pagination page={picker.page} pageSize={picker.pageSize} total={picker.totalCount} onChange={picker.setPage} itemLabel="fichas" />
      </ScrollView>
      <ActionBar>
        <Button
          title={canShare ? `Listo · Compartir (${selectedCount})` : 'Listo'}
          icon={canShare ? 'send' : 'check'}
          onPress={() => void finish()}
          loading={finishing}
          disabled={canShare && selectedCount === 0 && categoryCount === 0}
          style={styles.primary}
        />
      </ActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.lg },
  filters: { gap: Spacing.md },
  count: { ...Typography.metadata, textAlign: 'right' },
  list: { gap: Spacing.md },
  primary: { flex: 1 },
});
