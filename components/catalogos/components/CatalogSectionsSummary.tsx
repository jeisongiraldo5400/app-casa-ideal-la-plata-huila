import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Card, StatusChip } from '@/components/ui';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { SECTION_THUMB_LIMIT } from '@/lib/catalogos/constants';
import { pluralize } from '@/lib/catalogos/labels';
import type { CatalogSection } from '@/lib/catalogos/types';
import type { ProductLookup } from '../infrastructure/hooks/useCatalogDetail';
import { CatalogProductThumb } from './CatalogProductThumb';

interface CatalogSectionsSummaryProps {
  sections: CatalogSection[];
  products: ProductLookup;
}

/** Categorías cerradas por defecto: se abre solo la fila que el usuario elige. */
export function CatalogSectionsSummary({ sections, products }: CatalogSectionsSummaryProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={styles.list}>
      {sections.map((section) => {
        const categoryItems = section.items.filter((item) => item.itemType === 'category');
        const directProducts = section.items
          .filter((item) => item.itemType === 'product')
          .map((item) => products.get(item.referenceId))
          .filter((product): product is NonNullable<typeof product> => Boolean(product));
        const categoryProducts = [...products.values()].filter((product) =>
          categoryItems.some((item) => item.referenceId === product.categoryId),
        );
        const published = [...new Map(
          [...directProducts, ...categoryProducts].map((product) => [product.productId, product]),
        ).values()];
        const unpublished = section.items.filter((item) => item.itemType === 'product').length - directProducts.length;
        const visible = published.slice(0, SECTION_THUMB_LIMIT);
        const hidden = published.length - visible.length;
        const expanded = expandedId === section.id;

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
                <Text style={[styles.count, { color: colors.text.secondary }]}>{pluralize(published.length, 'producto', 'productos')}</Text>
              </View>
              <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={IconSize.md} color={colors.text.secondary} />
            </Pressable>

            {expanded ? (
              <View style={styles.expandedBody}>
                {section.kicker ? <Text style={[styles.kicker, { color: colors.text.tertiary }]}>{section.kicker}</Text> : null}
                {section.body ? <Text style={[styles.body, { color: colors.text.secondary }]}>{section.body}</Text> : null}
                {categoryItems.length > 0 ? (
                  <View style={styles.chips}>
                    {categoryItems.map((item) => <StatusChip key={item.id} label="Categoría" tone="info" icon="category" />)}
                  </View>
                ) : null}
                {visible.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                    {visible.map((product) => (
                      <CatalogProductThumb key={product.productId} uri={product.coverImageUrl} size={64} recyclingKey={product.productId} accessibilityLabel={product.displayName} />
                    ))}
                    {hidden > 0 ? <View style={[styles.more, { backgroundColor: colors.surface.sunken }]}><Text style={[styles.moreText, { color: colors.text.secondary }]}>+{hidden}</Text></View> : null}
                  </ScrollView>
                ) : (
                  <View style={styles.empty}>
                    <MaterialIcons name="info-outline" size={IconSize.sm} color={colors.text.tertiary} />
                    <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>Sin productos publicados.</Text>
                  </View>
                )}
                {unpublished > 0 ? <Text style={[styles.warning, { color: colors.warning.dark }]}>{pluralize(unpublished, 'producto sin ficha publicada', 'productos sin ficha publicada')}: no aparecerá.</Text> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
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
  strip: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  more: { width: 64, height: 64, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...Typography.bodySmallStrong },
  empty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  emptyText: { ...Typography.caption },
  warning: { ...Typography.caption },
});
