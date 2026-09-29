import { MaterialIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, Card, StatusChip } from '@/components/ui';
import { IconSize, Spacing, Typography, getColors } from '@/constants/theme';
import { SECTION_PAGE_SIZE } from '@/lib/catalogos/constants';
import { pluralize } from '@/lib/catalogos/labels';
import { pendingCategoriesThrough, resolveCatalogSections } from '@/lib/catalogos/sectionCounts';
import type { CatalogSection } from '@/lib/catalogos/types';
import type { CategoryPreviewLookup, ProductLookup } from '../infrastructure/hooks/useCatalogDetail';
import type { ImagePreviewTarget } from '../infrastructure/hooks/useProductGallery';
import { CatalogImageViewer } from './CatalogImageViewer';
import { CatalogProductThumb } from './CatalogProductThumb';

interface CatalogSectionsSummaryProps {
  sections: CatalogSection[];
  products: ProductLookup;
  categories: CategoryPreviewLookup;
  /**
   * Trae enteras las categorías completas que solo tienen la muestra inicial.
   * Sin él, «Ver más» solo recorre lo ya cargado.
   */
  onLoadCategories?: (categoryIds: readonly string[]) => Promise<void>;
}

/**
 * Categorías del catálogo con TODOS sus productos (sueltos y los de cada
 * categoría completa, siempre al día), sin repetidos entre categorías, como
 * los verá el cliente. Cada categoría muestra `SECTION_PAGE_SIZE` filas y
 * «Ver más» añade las siguientes: la lista entera de una categoría completa
 * solo se pide cuando hace falta.
 *
 * Una fila abierta a la vez. La primera categoría arranca desplegada para
 * que la ficha no se vea como una lista de títulos vacíos; las demás las abre
 * el usuario.
 */
export function CatalogSectionsSummary({ sections, products, categories, onLoadCategories }: CatalogSectionsSummaryProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const firstSectionId = sections[0]?.id ?? null;
  const [preview, setPreview] = useState<ImagePreviewTarget | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(firstSectionId);
  const [shownBySection, setShownBySection] = useState<Record<string, number>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  // Las categorías llegan asíncronas y cambian al abrir otro catálogo. Al
  // seguir el id de la primera (y no la longitud) solo se reabre cuando de
  // verdad es otra lista: si el usuario la cierra, se queda cerrada.
  const [syncedFirstId, setSyncedFirstId] = useState<string | null>(firstSectionId);
  if (syncedFirstId !== firstSectionId) {
    setSyncedFirstId(firstSectionId);
    setExpandedId(firstSectionId);
    setShownBySection({});
  }

  const resolved = useMemo(() => resolveCatalogSections(sections, products, categories), [sections, products, categories]);

  const showMore = async (sectionId: string, position: number, shown: number) => {
    const next = shown + SECTION_PAGE_SIZE;
    const loaded = resolved[position]?.products.length ?? 0;
    const pending = pendingCategoriesThrough(resolved, position);
    if (next > loaded && pending.length > 0 && onLoadCategories) {
      setLoadingId(sectionId);
      setFailedId(null);
      try {
        await onLoadCategories(pending);
      } catch {
        setFailedId(sectionId);
        return;
      } finally {
        setLoadingId(null);
      }
    }
    setShownBySection((current) => ({ ...current, [sectionId]: next }));
  };

  return (
    <View style={styles.list}>
      {sections.map((section, position) => {
        const categoryItems = section.items.filter((item) => item.itemType === 'category');
        const { products: sectionProducts, count, unpublished, repeated } = resolved[position];
        const shown = shownBySection[section.id] ?? SECTION_PAGE_SIZE;
        const visible = sectionProducts.slice(0, shown);
        const remaining = Math.max(0, count - visible.length);
        const expanded = expandedId === section.id;
        const loading = loadingId === section.id;

        return (
          <Card key={section.id} variant="outlined" style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? 'Cerrar' : 'Abrir'} categoría ${section.title}`}
              accessibilityState={{ expanded }}
              onPress={() => setExpandedId(expanded ? null : section.id)}
              style={styles.header}
            >
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{section.title}</Text>
                <Text style={[styles.count, { color: colors.text.secondary }]}>{pluralize(count, 'producto', 'productos')}</Text>
              </View>
              <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={IconSize.md} color={colors.text.secondary} />
            </Pressable>

            {expanded ? (
              <View style={styles.expandedBody}>
                {section.kicker ? <Text style={[styles.kicker, { color: colors.text.tertiary }]}>{section.kicker}</Text> : null}
                {section.body ? <Text style={[styles.body, { color: colors.text.secondary }]}>{section.body}</Text> : null}
                {categoryItems.length > 0 ? (
                  <View style={styles.chips}>
                    {categoryItems.map((item) => <StatusChip key={item.id} label={categories.get(item.referenceId)?.items[0]?.categoryName ?? 'Categoría'} tone="info" icon="category" />)}
                  </View>
                ) : null}
                {visible.length > 0 ? (
                  <View style={styles.rows}>
                    {visible.map((product) => (
                      <View key={product.productId} style={styles.row}>
                        <CatalogProductThumb
                          uri={product.coverImageUrl}
                          size={48}
                          recyclingKey={product.productId}
                          accessibilityLabel={product.displayName}
                          onPress={() => setPreview({ title: product.displayName, coverUrl: product.coverImageUrl, slug: product.slug })}
                        />
                        <Text style={[styles.rowName, { color: colors.text.primary }]} numberOfLines={2}>{product.displayName}</Text>
                      </View>
                    ))}
                  </View>
                ) : count > 0 ? null : (
                  <View style={styles.empty}>
                    <MaterialIcons name="info-outline" size={IconSize.sm} color={colors.text.tertiary} />
                    <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
                      {repeated > 0 ? 'Sus productos ya salen en otra categoría.' : 'Sin productos publicados.'}
                    </Text>
                  </View>
                )}
                {remaining > 0 ? (
                  <Button
                    title={`Ver más (${remaining})`}
                    variant="ghost"
                    size="sm"
                    icon="expand-more"
                    loading={loading}
                    accessibilityLabel={`Ver más productos de ${section.title}`}
                    onPress={() => void showMore(section.id, position, Math.max(shown, visible.length))}
                  />
                ) : null}
                {failedId === section.id ? (
                  <Text style={[styles.warning, { color: colors.warning.dark }]}>No se pudieron cargar más productos. Revisa la conexión e inténtalo de nuevo.</Text>
                ) : null}
                {unpublished > 0 ? <Text style={[styles.warning, { color: colors.warning.dark }]}>{pluralize(unpublished, 'producto sin ficha publicada', 'productos sin ficha publicada')}: no aparecerá.</Text> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
      <CatalogImageViewer target={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  section: { overflow: 'hidden' },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  headerText: { flex: 1, gap: Spacing.xs },
  title: { ...Typography.bodyStrong, fontWeight: '800', flex: 1 },
  count: { ...Typography.metadata },
  expandedBody: { gap: Spacing.sm, paddingTop: Spacing.sm },
  kicker: { ...Typography.label },
  body: { ...Typography.bodySmall },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  rows: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
  rowName: { ...Typography.bodySmall, flex: 1 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  emptyText: { ...Typography.caption },
  warning: { ...Typography.caption },
});
