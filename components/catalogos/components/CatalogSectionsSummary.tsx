import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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

/** Capítulos en solo lectura: título, antetítulo y una tira de miniaturas. */
export function CatalogSectionsSummary({ sections, products }: CatalogSectionsSummaryProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <View style={styles.list}>
      {sections.map((section) => {
        const productItems = section.items.filter((item) => item.itemType === 'product');
        const categoryItems = section.items.filter((item) => item.itemType === 'category');
        const published = productItems.filter((item) => products.has(item.referenceId));
        const unpublished = productItems.length - published.length;
        const visible = published.slice(0, SECTION_THUMB_LIMIT);
        const hidden = published.length - visible.length;

        return (
          <Card key={section.id} variant="outlined" style={styles.section}>
            {section.kicker ? (
              <Text style={[styles.kicker, { color: colors.text.tertiary }]} numberOfLines={1}>
                {section.kicker}
              </Text>
            ) : null}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={[styles.count, { color: colors.text.secondary }]}>{pluralize(published.length, 'ficha', 'fichas')}</Text>
            </View>
            {section.body ? (
              <Text style={[styles.body, { color: colors.text.secondary }]} numberOfLines={3}>
                {section.body}
              </Text>
            ) : null}
            {categoryItems.length > 0 ? (
              <View style={styles.chips}>
                {categoryItems.map((item) => (
                  <StatusChip key={item.id} label="Categoría completa" tone="info" icon="category" />
                ))}
              </View>
            ) : null}
            {visible.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                {visible.map((item) => {
                  const product = products.get(item.referenceId);
                  return (
                    <View key={item.id} style={styles.thumbWrap}>
                      <CatalogProductThumb uri={product?.coverImageUrl} size={64} recyclingKey={item.referenceId} accessibilityLabel={product?.displayName} />
                      {item.isFeatured ? (
                        <View style={[styles.star, { backgroundColor: colors.warning.main }]}>
                          <MaterialIcons name="star" size={12} color={colors.onPrimary.text} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {hidden > 0 ? (
                  <View style={[styles.more, { backgroundColor: colors.surface.sunken }]}>
                    <Text style={[styles.moreText, { color: colors.text.secondary }]}>+{hidden}</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : categoryItems.length === 0 ? (
              <View style={styles.empty}>
                <MaterialIcons name="info-outline" size={IconSize.sm} color={colors.text.tertiary} />
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>Sin fichas publicadas en este capítulo.</Text>
              </View>
            ) : null}
            {unpublished > 0 ? (
              <Text style={[styles.warning, { color: colors.warning.dark }]}>
                {pluralize(unpublished, 'producto sin ficha publicada', 'productos sin ficha publicada')}: no saldrán en la revista.
              </Text>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  section: { gap: Spacing.sm },
  kicker: { ...Typography.label },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm },
  title: { ...Typography.bodyStrong, fontWeight: '800', flex: 1 },
  count: { ...Typography.metadata },
  body: { ...Typography.bodySmall },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  strip: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  thumbWrap: { position: 'relative' },
  star: { position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  more: { width: 64, height: 64, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...Typography.bodySmallStrong },
  empty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  emptyText: { ...Typography.caption },
  warning: { ...Typography.caption },
});
