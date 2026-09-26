import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Spacing, getColors } from '@/constants/theme';
import { CarteraFilterModal } from '@/components/cartera/CarteraFilterModal';
import { CarteraCuotaRow } from '@/components/cartera/CarteraCuotaRow';
import { CarteraEmptyState } from '@/components/cartera/CarteraEmptyState';
import { CarteraListFooter } from '@/components/cartera/CarteraListFooter';
import { CarteraListHeader } from '@/components/cartera/CarteraListHeader';
import { MisCobrosEntryButton } from '@/components/cartera/mis-cobros/MisCobrosEntryButton';
import { useCarteraList } from '@/components/cartera/infrastructure/hooks/useCarteraList';
import { countActiveCarteraFilters, describeCarteraFilters } from '@/lib/cartera/carteraFilters';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useScreenLoading } from '@/hooks/useScreenLoading';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function CarteraScreen() {
  return (
    <ScreenErrorBoundary screen="Cartera">
      <CarteraScreenInner />
    </ScreenErrorBoundary>
  );
}

function CarteraScreenInner() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, onlyFindsBySearch } = useUserRoles();
  // El recaudador cobra en cualquier negocio pero no recorre la cartera: solo
  // ve lo que busca (20261125120000). Aquí se explica por qué, en vez de dejar
  // una lista vacía.
  const searchOnly = onlyFindsBySearch();
  const list = useCarteraList({ searchOnly });
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  // Publica la carga de esta pantalla al aviso global (components/ui/GlobalLoadingBar).
  useScreenLoading(list.loading);

  const { filters } = list;
  const activeCount = countActiveCarteraFilters(filters);
  const hasSearch = (filters.search || '').trim().length > 0;
  const countLabel =
    searchOnly && !hasSearch
      ? 'Cobro por búsqueda'
      : `${list.totalCount} ${filters.filter === 'pagadas' ? 'cuotas pagadas' : 'cuotas abiertas'}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={list.rows}
        keyExtractor={(item) => item.cuota_id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
        ListHeaderComponent={
          <CarteraListHeader
            colors={colors}
            countLabel={countLabel}
            localDataLabel={list.fromCache ? formatLocalDataLabel(lastSyncedAt) : null}
            activeCount={activeCount}
            onOpenFilters={list.openFilters}
            onReload={list.reload}
            showSummary={!searchOnly}
            summary={list.dashboard?.summary}
            // Un solo acceso a «Cobros»: lo registrado, la cartera asignada,
            // otro cobrador (admin), Excel y recibos viven en esa pantalla.
            actions={<MisCobrosEntryButton />}
            search={filters.search || ''}
            onSearchChange={list.changeSearch}
            filtersDescription={describeCarteraFilters(filters)}
            onClearFilters={list.clearFilters}
            fromCache={list.fromCache}
          />
        }
        renderItem={({ item }) => <CarteraCuotaRow row={item} colors={colors} onPress={list.openNegocio} />}
        ListEmptyComponent={
          <CarteraEmptyState
            loading={list.loading}
            searchOnly={searchOnly}
            search={filters.search || ''}
            activeCount={activeCount}
            fromCache={list.fromCache}
            colors={colors}
          />
        }
        ListFooterComponent={
          <CarteraListFooter
            shown={list.rows.length}
            total={list.totalCount}
            loadingMore={list.loadingMore}
            onLoadMore={list.loadMore}
            colors={colors}
          />
        }
      />
      <CarteraFilterModal
        visible={list.filtersOpen}
        municipios={list.catalogs.municipios}
        sellers={list.catalogs.sellers}
        paymentMethods={list.catalogs.paymentMethods}
        values={list.draftFilters}
        onChange={list.setDraftFilters}
        onApply={list.applyFilters}
        onClose={list.cancelFilters}
        showGestor={isAdmin()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
});
