import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  /** Nombre plural de los registros ("cuotas", "pagos") para el resumen. */
  itemLabel?: string;
}

/** Paginación local para listas cortas dentro de un ScrollView. */
export function Pagination({ page, pageSize, total, onChange, itemLabel = 'registros' }: PaginationProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  if (pageCount <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <View style={styles.container} accessibilityRole="toolbar">
      <Text style={[styles.summary, { color: colors.text.secondary }]}>
        {from}–{to} de {total} {itemLabel}
      </Text>
      <View style={styles.controls}>
        <Button
          title="Anterior"
          variant="outline"
          size="sm"
          icon="chevron-left"
          disabled={page === 0}
          onPress={() => onChange(Math.max(page - 1, 0))}
          accessibilityLabel="Página anterior"
        />
        <Text style={[styles.page, { color: colors.text.primary }]}>
          {page + 1} / {pageCount}
        </Text>
        <Button
          title="Siguiente"
          variant="outline"
          size="sm"
          disabled={page + 1 >= pageCount}
          onPress={() => onChange(page + 1)}
          accessibilityLabel="Página siguiente"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  summary: { ...Typography.metadata },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  page: { ...Typography.bodySmallStrong, minWidth: 48, textAlign: 'center' },
});
