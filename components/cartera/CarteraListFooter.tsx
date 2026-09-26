import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Radius, Spacing, type ThemeColors } from '@/constants/theme';

type Props = {
  shown: number;
  total: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  colors: ThemeColors;
};

/** Pie del listado: «Cargar más · N de M» mientras falten cuotas; si no, cuántas se muestran. */
export function CarteraListFooter({ shown, total, loadingMore, onLoadMore, colors }: Props) {
  if (shown < total) {
    return (
      <Pressable disabled={loadingMore} onPress={onLoadMore} style={[styles.loadMore, { borderColor: colors.divider }]}>
        {loadingMore ? (
          <ActivityIndicator color={colors.primary.main} />
        ) : (
          <Text style={[styles.loadMoreText, { color: colors.primary.main }]}>
            Cargar más · {shown} de {total}
          </Text>
        )}
      </Pressable>
    );
  }
  if (!shown) return null;
  return (
    <Text style={[styles.end, { color: colors.text.secondary }]}>
      Mostrando {shown} de {total} cuotas
    </Text>
  );
}

const styles = StyleSheet.create({
  loadMore: { minHeight: 50, borderWidth: 1, borderRadius: Radius.control, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  loadMoreText: { fontWeight: '700' },
  end: { textAlign: 'center', marginVertical: Spacing.lg, fontSize: 12 },
});
