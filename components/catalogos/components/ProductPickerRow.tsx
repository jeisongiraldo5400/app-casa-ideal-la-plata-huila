import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { IconButton, ListCard } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import { CatalogProductThumb } from './CatalogProductThumb';

interface ProductPickerRowProps {
  item: PublicCatalogListingItem;
  selected: boolean;
  pending: boolean;
  onToggle: () => void;
}

export function ProductPickerRow({ item, selected, pending, onToggle }: ProductPickerRowProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const meta = [item.categoryName, item.brandName].filter(Boolean).join(' · ');

  return (
    <ListCard onPress={onToggle} disabled={pending} accessibilityLabel={`${item.displayName}, ${selected ? 'en el catálogo' : 'no seleccionado'}`}>
      <View style={styles.row}>
        <CatalogProductThumb uri={item.coverImageUrl} size={64} recyclingKey={item.productId} />
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>
            {item.displayName}
          </Text>
          {meta ? (
            <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon={selected ? 'check-circle' : 'add-circle-outline'}
          color={selected ? colors.success.dark : colors.primary.main}
          onPress={onToggle}
          disabled={pending}
          accessibilityLabel={selected ? 'Quitar del catálogo' : 'Añadir al catálogo'}
        />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  copy: { flex: 1, gap: 2 },
  name: { ...Typography.bodyStrong },
  meta: { ...Typography.caption },
});
