import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Card, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { catalogStatusTone, labelCatalogScope, labelCatalogStatus } from '@/lib/catalogos/labels';
import type { CatalogScope, PrivateCatalog, PrivateCatalogStatus } from '@/lib/catalogos/types';
import { CatalogProductThumb } from './CatalogProductThumb';

interface CatalogHeaderCardProps {
  catalog: PrivateCatalog;
  status: PrivateCatalogStatus;
  scope: CatalogScope;
  ownerName: string | null;
}

/**
 * Encabezado compacto: miniatura de la portada (si el web ya la subió),
 * título público, estado e introducción. Solo lectura; la plantilla no se
 * muestra porque en móvil no se edita.
 */
export function CatalogHeaderCard({ catalog, status, scope, ownerName }: CatalogHeaderCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const byline = scope === 'own' ? labelCatalogScope('own') : `${labelCatalogScope(scope)}${ownerName ? ` · ${ownerName}` : ''}`;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        {catalog.coverImageUrl ? <CatalogProductThumb uri={catalog.coverImageUrl} size={64} accessibilityLabel="Portada" /> : null}
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>
            {catalog.publicTitle}
          </Text>
          <View style={styles.meta}>
            <StatusChip label={labelCatalogStatus(status)} tone={catalogStatusTone(status)} />
            <Text style={[styles.byline, { color: colors.text.tertiary }]} numberOfLines={1}>
              {byline}
            </Text>
          </View>
        </View>
      </View>
      {catalog.introduction ? (
        <Text style={[styles.intro, { color: colors.text.secondary }]} numberOfLines={2}>
          {catalog.introduction}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  copy: { flex: 1, gap: Spacing.xs },
  title: { ...Typography.section },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  intro: { ...Typography.bodySmall },
  byline: { ...Typography.metadata, flexShrink: 1 },
});
