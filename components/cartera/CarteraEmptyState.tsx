import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '@/constants/theme';
import { DownloadDataButton } from '@/components/offline';

type Props = {
  loading: boolean;
  /** Recaudador sin término: solo ve lo que busca. */
  searchOnly: boolean;
  search: string;
  activeCount: number;
  fromCache: boolean;
  colors: ThemeColors;
};

/** Qué decir cuando el listado está vacío (o el indicador mientras carga). */
export function carteraEmptyMessage({ searchOnly, search, activeCount, fromCache }: Omit<Props, 'loading' | 'colors'>): string {
  const hasSearch = search.trim().length > 0;
  if (searchOnly && !hasSearch) {
    return 'Busca el negocio que vas a cobrar por su número o por la cédula del cliente. No se muestra la cartera completa.';
  }
  if (hasSearch) return `Sin cuotas para «${search}»${activeCount ? ' con estos filtros' : ''}`;
  if (fromCache) return 'No hay datos locales. Conéctese y pulse Descargar información.';
  return 'Sin cuotas para estos filtros';
}

export function CarteraEmptyState({ loading, colors, ...rest }: Props) {
  if (loading) return <ActivityIndicator color={colors.primary.main} style={styles.loading} />;
  const hasSearch = rest.search.trim().length > 0;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.empty, { color: colors.text.secondary }]}>{carteraEmptyMessage(rest)}</Text>
      {rest.searchOnly && !hasSearch ? null : <DownloadDataButton variant="cta" />}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { margin: 30 },
  wrap: { alignItems: 'center' },
  empty: { textAlign: 'center', marginVertical: 35 },
});
