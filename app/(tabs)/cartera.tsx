import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SegmentedControl } from '@/components/ui';
import { useTheme } from '@/components/theme';
import { Spacing, getColors } from '@/constants/theme';
import { CarteraFilterModal } from '@/components/cartera/CarteraFilterModal';
import { CarteraCuotaRow } from '@/components/cartera/CarteraCuotaRow';
import { CarteraEmptyState } from '@/components/cartera/CarteraEmptyState';
import { CarteraListFooter } from '@/components/cartera/CarteraListFooter';
import { CarteraListHeader } from '@/components/cartera/CarteraListHeader';
import { CarteraPagosView } from '@/components/cartera/mis-cobros/CarteraPagosView';
import { useCarteraList } from '@/components/cartera/infrastructure/hooks/useCarteraList';
import { countActiveCarteraFilters, describeCarteraFilters } from '@/lib/cartera/carteraFilters';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useScreenLoading } from '@/hooks/useScreenLoading';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useUltimaGestion } from '@/components/collection-routes/useUltimaGestion';

type CarteraVista = 'cuotas' | 'pagos';

const VISTAS: { value: CarteraVista; label: string }[] = [
  { value: 'cuotas', label: 'Cuotas' },
  { value: 'pagos', label: 'Pagos' },
];

/**
 * Cartera con dos vistas separadas: «Cuotas» (lo que se debe) y «Pagos» (los
 * abonos recibidos, con sus filtros y totales). `?vista=pagos` abre en Pagos.
 */
export default function CarteraScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const params = useLocalSearchParams<{ vista?: string }>();
  const requested: CarteraVista = params.vista === 'pagos' ? 'pagos' : 'cuotas';
  const [vista, setVista] = useState<CarteraVista>(requested);
  useEffect(() => {
    if (params.vista) setVista(requested);
  }, [params.vista, requested]);

  return (
    <ScreenErrorBoundary screen="Cartera">
      <View style={[styles.container, { backgroundColor: colors.background.default }]}>
        <View style={styles.switcher}>
          <SegmentedControl items={VISTAS} value={vista} onChange={(value) => setVista(value as CarteraVista)} />
        </View>
        {/* Cuotas queda montada: al volver de Pagos no se recarga ni pierde filtros. */}
        <View style={[styles.container, vista !== 'cuotas' && styles.hidden]}>
          <CarteraScreenInner />
        </View>
        {vista === 'pagos' ? <CarteraPagosView /> : null}
      </View>
    </ScreenErrorBoundary>
  );
}

function CarteraScreenInner() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, isRecaudador, isVendedor, isGestorCobro, onlyFindsBySearch } = useUserRoles();
  const { user } = useAuth();
  // El recaudador cobra en cualquier negocio pero no recorre la cartera: solo
  // ve lo que busca (20261125120000). Aquí se explica por qué, en vez de dejar
  // una lista vacía.
  const searchOnly = onlyFindsBySearch();
  // Recaudador no admin que además es vendedor o gestor: el teléfono tiene
  // TODOS los negocios (para cobrar sin señal), pero sin señal y sin buscar ve
  // sólo su propia cartera, como con señal (la cartera total es del admin).
  const recaudadorNoAdmin = isRecaudador() && !isAdmin();
  const vendedor = isVendedor();
  const gestor = isGestorCobro();
  const userId = user?.id ?? null;
  const ownScope = useMemo(
    () => (recaudadorNoAdmin && userId ? { userId, vendedor, gestor } : null),
    [gestor, recaudadorNoAdmin, userId, vendedor]
  );
  const list = useCarteraList({ searchOnly, ownScope });
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const online = useSyncStore((state) => state.online);
  // Última novedad de ruta de los negocios listados: una consulta por página.
  const gestiones = useUltimaGestion(list.rows.map((row) => row.negocio_id), online, list.rows);
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
            search={filters.search || ''}
            onSearchChange={list.changeSearch}
            filtersDescription={describeCarteraFilters(filters)}
            onClearFilters={list.clearFilters}
            fromCache={list.fromCache}
          />
        }
        renderItem={({ item }) => (
          <CarteraCuotaRow row={item} colors={colors} onPress={list.openNegocio} gestion={gestiones.get(item.negocio_id)} />
        )}
        ListEmptyComponent={
          <CarteraEmptyState
            loading={list.loading}
            searchOnly={searchOnly}
            search={filters.search || ''}
            activeCount={activeCount}
            fromCache={list.fromCache}
            error={list.loadError}
            onRetry={list.reload}
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
  switcher: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  hidden: { display: 'none' },
  list: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
});
