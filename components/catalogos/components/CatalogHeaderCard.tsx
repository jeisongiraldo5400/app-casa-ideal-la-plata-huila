import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Card, StatusChip } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { catalogStatusTone, labelCatalogScope, labelCatalogStatus, labelCatalogTemplate } from '@/lib/catalogos/labels';
import type { CatalogScope, PrivateCatalog, PrivateCatalogStatus } from '@/lib/catalogos/types';

interface CatalogHeaderCardProps {
  catalog: PrivateCatalog;
  status: PrivateCatalogStatus;
  scope: CatalogScope;
  ownerName: string | null;
}

/** Portada (si el web ya la subió), título público, introducción y estado. Solo lectura. */
export function CatalogHeaderCard({ catalog, status, scope, ownerName }: CatalogHeaderCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const byline = scope === 'own' ? labelCatalogScope('own') : `${labelCatalogScope(scope)}${ownerName ? ` · ${ownerName}` : ''}`;

  return (
    <Card style={styles.card}>
      {catalog.coverImageUrl ? (
        <Image source={{ uri: catalog.coverImageUrl }} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" transition={150} />
      ) : null}
      <View style={styles.chips}>
        <StatusChip label={labelCatalogStatus(status)} tone={catalogStatusTone(status)} />
        <StatusChip label={labelCatalogTemplate(catalog.template)} tone="neutral" icon="palette" />
      </View>
      <Text style={[styles.title, { color: colors.text.primary }]}>{catalog.publicTitle}</Text>
      {catalog.introduction ? (
        <Text style={[styles.intro, { color: colors.text.secondary }]} numberOfLines={4}>
          {catalog.introduction}
        </Text>
      ) : null}
      <Text style={[styles.byline, { color: colors.text.tertiary }]}>{byline}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.control, marginBottom: Spacing.xs },
  chips: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  title: { ...Typography.headline },
  intro: { ...Typography.body },
  byline: { ...Typography.metadata },
});
