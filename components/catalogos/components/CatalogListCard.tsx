import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { catalogStatusTone, formatCatalogDate, labelCatalogScope, labelCatalogStatus, pluralize } from '@/lib/catalogos/labels';
import { catalogDisplayStatus } from '@/lib/catalogos/shareLinks';
import type { PrivateCatalogListItem } from '@/lib/catalogos/types';
import { CatalogProductThumb } from './CatalogProductThumb';

export function CatalogListCard({ item, onPress }: { item: PrivateCatalogListItem; onPress: () => void }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const status = catalogDisplayStatus(item);
  // En un catálogo ajeno la RLS solo devuelve los enlaces que uno mismo
  // entregó, así que tener alguno es la señal de que ya se está distribuyendo:
  // ahí interesan más los contadores que el ámbito.
  const showLinkMeta = item.isOwner || item.linkCount > 0;
  const meta = showLinkMeta
    ? [
        item.isOwner ? null : labelCatalogScope(item.scope),
        pluralize(item.activeLinkCount, 'enlace activo', 'enlaces activos'),
        pluralize(item.totalViewCount, 'vista', 'vistas'),
        item.nextExpiration ? `vence ${formatCatalogDate(item.nextExpiration)}` : null,
      ]
    : [labelCatalogScope(item.scope), `actualizado ${formatCatalogDate(item.updatedAt)}`];

  return (
    <ListCard onPress={onPress} accessibilityLabel={`Catálogo ${item.internalTitle}, ${labelCatalogStatus(status)}`}>
      <View style={styles.row}>
        <CatalogProductThumb uri={item.coverImageUrl} size={56} recyclingKey={item.id} />
        <View style={styles.copy}>
          <View style={styles.top}>
            <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
              {item.internalTitle}
            </Text>
            <StatusChip label={labelCatalogStatus(status)} tone={catalogStatusTone(status)} />
          </View>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]} numberOfLines={1}>
            {item.publicTitle}
          </Text>
          <Text style={[styles.meta, { color: colors.text.tertiary }]} numberOfLines={1}>
            {meta.filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  copy: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { ...Typography.bodyStrong, fontWeight: '800', flex: 1 },
  subtitle: { ...Typography.bodySmall },
  meta: { ...Typography.caption },
});
