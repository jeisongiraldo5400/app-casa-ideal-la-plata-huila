import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Radius, Spacing, type ThemeColors } from '@/constants/theme';
import type { CarteraDashboard } from '@/lib/cartera/carteraService';
import { CarteraSearchField } from './CarteraSearchField';
import { CarteraSummaryCards } from './CarteraSummaryCards';

type Props = {
  colors: ThemeColors;
  /** «N cuotas abiertas», «N cuotas pagadas» o «Cobro por búsqueda». */
  countLabel: string;
  /** Rótulo de «datos del teléfono» cuando la lista viene de lo guardado. */
  localDataLabel: string | null;
  activeCount: number;
  onOpenFilters: () => void;
  onReload: () => void;
  /** El recaudador no ve el resumen: solo cobra lo que busca. */
  showSummary: boolean;
  summary: CarteraDashboard['summary'] | undefined;
  /** Accesos bajo el resumen (p. ej. «Cobros»). */
  actions?: ReactNode;
  search: string;
  onSearchChange: (term: string) => void;
  filtersDescription: string;
  onClearFilters: () => void;
  fromCache: boolean;
};

/**
 * Cabecera del listado de Cartera: conteo, botones de filtros y recarga,
 * resumen, accesos, buscador y resumen de filtros. Se pasa a la lista como
 * elemento (no como componente nuevo en cada render) para que el buscador no
 * se remonte y no pierda lo escrito.
 */
export function CarteraListHeader({
  colors,
  countLabel,
  localDataLabel,
  activeCount,
  onOpenFilters,
  onReload,
  showSummary,
  summary,
  actions,
  search,
  onSearchChange,
  filtersDescription,
  onClearFilters,
  fromCache,
}: Props) {
  return (
    <View>
      <View style={styles.top}>
        <View>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>{countLabel}</Text>
          {localDataLabel ? (
            <Text style={[styles.meta, styles.localData, { color: colors.text.secondary }]}>{localDataLabel}</Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={onOpenFilters}
            accessibilityRole="button"
            accessibilityLabel={activeCount ? `Filtros, ${activeCount} activos` : 'Filtros'}
            style={[styles.icon, { backgroundColor: colors.background.paper }]}>
            <MaterialIcons name="tune" size={23} color={colors.primary.main} />
            {activeCount ? (
              <View style={[styles.badge, { backgroundColor: colors.primary.main }]}>
                <Text style={[styles.badgeText, { color: colors.primary.contrastText }]}>{activeCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={onReload} style={[styles.icon, { backgroundColor: colors.background.paper }]}>
            <MaterialIcons name="refresh" size={23} color={colors.primary.main} />
          </Pressable>
        </View>
      </View>
      {showSummary ? <CarteraSummaryCards summary={summary} colors={colors} /> : null}
      {actions}
      <Text style={[styles.section, { color: colors.text.primary }]}>Cuotas</Text>
      {/* Buscador de cuotas: por cédula, nombre del cliente o número de negocio. Con señal
          consulta al servidor; sin señal, la base local (los dos sin tildes). */}
      <CarteraSearchField value={search} colors={colors} onChange={onSearchChange} />
      <View style={styles.summaryRow}>
        <Text style={[styles.summary, { color: colors.text.secondary }]}>{filtersDescription}</Text>
        {activeCount ? (
          <Pressable onPress={onClearFilters} accessibilityRole="button" accessibilityLabel="Limpiar filtros" hitSlop={8}>
            <Text style={[styles.clear, { color: colors.primary.main }]}>Limpiar filtros</Text>
          </Pressable>
        ) : null}
      </View>
      {fromCache ? (
        <Text style={[styles.offlineNote, { color: colors.warning.main }]}>
          Sin señal: búsqueda y filtros sobre los datos guardados en el teléfono.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  meta: { fontSize: 12 },
  localData: { marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  icon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.control },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  section: { fontSize: 19, lineHeight: 24, fontWeight: '800', marginTop: Spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 8 },
  summary: { flex: 1, fontSize: 12 },
  clear: { fontWeight: '700', fontSize: 12 },
  offlineNote: { fontSize: 12, marginBottom: 8 },
});
