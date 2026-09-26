import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { Radius, Spacing, getColors } from '@/constants/theme';
import { CarteraFilterModal } from '@/components/cartera/CarteraFilterModal';
import { CarteraCuotaRow } from '@/components/cartera/CarteraCuotaRow';
import { CarteraEmptyState } from '@/components/cartera/CarteraEmptyState';
import { CarteraListFooter } from '@/components/cartera/CarteraListFooter';
import { CarteraListHeader } from '@/components/cartera/CarteraListHeader';
import { CollectionManagerPicker } from '@/components/cartera/CollectionManagerPicker';
import { CollectionManagerPaymentsModal } from '@/components/cartera/CollectionManagerPaymentsModal';
import { MisCobrosEntryButton } from '@/components/cartera/mis-cobros/MisCobrosEntryButton';
import { useCarteraList } from '@/components/cartera/infrastructure/hooks/useCarteraList';
import type { CollectionManager } from '@/lib/cartera/carteraService';
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
  const { isAdmin, isGestorCobro, onlyFindsBySearch } = useUserRoles();
  // El recaudador cobra en cualquier negocio pero no recorre la cartera: solo
  // ve lo que busca (20261125120000). Aquí se explica por qué, en vez de dejar
  // una lista vacía.
  const searchOnly = onlyFindsBySearch();
  const list = useCarteraList({ searchOnly });
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
  const [selectedManager, setSelectedManager] = useState<CollectionManager | null>(null);
  const [managerModalOpen, setManagerModalOpen] = useState(false);
  // Publica la carga de esta pantalla al aviso global (components/ui/GlobalLoadingBar).
  useScreenLoading(list.loading);

  const { filters } = list;
  const activeCount = countActiveCarteraFilters(filters);
  const hasSearch = (filters.search || '').trim().length > 0;
  const countLabel =
    searchOnly && !hasSearch
      ? 'Cobro por búsqueda'
      : `${list.totalCount} ${filters.filter === 'pagadas' ? 'cuotas pagadas' : 'cuotas abiertas'}`;
  const showManager = () => {
    if (isGestorCobro() && !isAdmin()) {
      Alert.alert('Mis cobros', 'Seleccione su usuario desde la lista de gestores disponible para su cuenta.');
    }
    setManagerPickerOpen(true);
  };

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
            actions={
              <>
                <MisCobrosEntryButton />
                {isAdmin() || isGestorCobro() ? (
                  <Pressable
                    onPress={showManager}
                    style={[styles.managerButton, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
                    accessibilityRole="button">
                    <View style={styles.managerButtonIcon}>
                      <MaterialIcons name="people-alt" size={20} color={colors.primary.main} />
                    </View>
                    <Text style={[styles.managerButtonLabel, { color: colors.text.primary }]} numberOfLines={1}>
                      {isAdmin() ? 'Ver cobros por gestor' : 'Cobros de mi cartera'}
                    </Text>
                    <View style={styles.managerButtonIcon}>
                      <MaterialIcons name="chevron-right" size={22} color={colors.text.secondary} />
                    </View>
                  </Pressable>
                ) : null}
              </>
            }
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
      <CollectionManagerPicker
        visible={managerPickerOpen}
        onClose={() => setManagerPickerOpen(false)}
        onSelect={(manager) => {
          setSelectedManager(manager);
          setManagerPickerOpen(false);
          setManagerModalOpen(true);
        }}
      />
      <CollectionManagerPaymentsModal
        visible={managerModalOpen}
        manager={selectedManager}
        colors={colors}
        onClose={() => {
          setManagerModalOpen(false);
          setSelectedManager(null);
        }}
        onOpenBusiness={(id) => {
          setManagerModalOpen(false);
          setSelectedManager(null);
          list.openNegocio(id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  managerButton: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: Spacing.md,
    gap: 8,
  },
  managerButtonIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  managerButtonLabel: { flex: 1, fontWeight: '700', fontSize: 15, lineHeight: 20 },
});
