import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = { loadingMore: boolean; shown: number; total: number; itemLabel: string };

/** Pie de las listas que se van sumando: «Cargando más…» o «Mostrando 30 de 120». */
export function ListFooter({ loadingMore, shown, total, itemLabel }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (loadingMore) {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={colors.primary.main} />
        <Text style={[styles.text, { color: colors.text.secondary }]}>Cargando más…</Text>
      </View>
    );
  }
  if (total === 0) return null;
  return (
    <Text style={[styles.text, styles.center, { color: colors.text.secondary }]}>
      {shown < total ? `Mostrando ${shown} de ${total} ${itemLabel}` : `${total} ${itemLabel} en total`}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  text: { ...Typography.caption },
  center: { textAlign: 'center', paddingVertical: Spacing.md },
});
