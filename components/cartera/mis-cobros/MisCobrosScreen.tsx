import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { CollectionManagerPicker } from '@/components/cartera/CollectionManagerPicker';
import { useTheme } from '@/components/theme';
import { Button, Card, Metric, ScreenState, SearchField, SegmentedControl } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { useScreenLoading } from '@/hooks/useScreenLoading';
import { useUserRoles } from '@/hooks/useUserRoles';
import { loadCarteraCatalogs } from '@/lib/cartera/carteraCatalogs';
import type { CollectionManager } from '@/lib/cartera/carteraService';
import {
  countActiveMisCobrosFilters,
  DEFAULT_MIS_COBROS_FILTERS,
  EMPTY_MIS_COBROS_SUMMARY,
  misCobrosRangeError,
  type MisCobroRow,
  type MisCobrosFilters,
  type MisCobrosStatus,
  type MisCobrosSummary,
} from '@/lib/cartera/misCobros';
import { fetchMisCobros } from '@/lib/cartera/misCobrosService';
import { formatCOP } from '@/lib/creditCalculator';
import { errorMessage } from '@/lib/errorMessage';
import { formatPaymentDateTime } from '@/lib/localDate';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { MisCobroCard } from './MisCobroCard';
import { MisCobrosFilterSheet } from './MisCobrosFilterSheet';

const PAGE_SIZE = 20;

const STATUS_SEGMENTS: { value: MisCobrosStatus; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'vigentes', label: 'Vigentes' },
  { value: 'anulados', label: 'Anulados' },
];

function rangeLabel(filters: MisCobrosFilters): string | null {
  if (!filters.from && !filters.to) return null;
  if (filters.from && filters.from === filters.to) return formatPaymentDateTime(filters.from);
  if (filters.from && filters.to) return `${formatPaymentDateTime(filters.from)} – ${formatPaymentDateTime(filters.to)}`;
  if (filters.from) return `Desde ${formatPaymentDateTime(filters.from)}`;
  return `Hasta ${formatPaymentDateTime(filters.to)}`;
}

/**
 * «Mis cobros»: los pagos que registró quien cobra, para separar lo que cobró
 * por fechas, método, sitio, estado y cierre. El administrador puede elegir
 * otro cobrador (la misma regla del diálogo «Cobros de …» de la web).
 */
export function MisCobrosScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const { isAdmin } = useUserRoles();
  const online = useSyncStore((state) => state.online);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);

  const [collector, setCollector] = useState<CollectionManager | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filters, setFilters] = useState<MisCobrosFilters>(DEFAULT_MIS_COBROS_FILTERS);
  const [draft, setDraft] = useState<MisCobrosFilters>(DEFAULT_MIS_COBROS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string }[]>([]);

  const [rows, setRows] = useState<MisCobroRow[]>([]);
  const [summary, setSummary] = useState<MisCobrosSummary>(EMPTY_MIS_COBROS_SUMMARY);
  const [page, setPage] = useState(1);
  const [fromCache, setFromCache] = useState(false);
  const [cierreIgnored, setCierreIgnored] = useState(false);
  const [unsentCount, setUnsentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useScreenLoading(loading);

  const isSelf = !collector || collector.id === user?.id;
  const collectorId = collector?.id || user?.id || '';
  // Cada carga lleva un número: una respuesta vieja (filtros ya cambiados) no pisa a la nueva.
  const requestId = useRef(0);

  useEffect(() => {
    let alive = true;
    void loadCarteraCatalogs().then((catalogs) => {
      if (alive) setPaymentMethods(catalogs.paymentMethods);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.search === searchInput ? current : { ...current, search: searchInput }));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (target: number) => {
      if (!collectorId) return;
      const rangeError = misCobrosRangeError(filters);
      if (rangeError) {
        setError(rangeError);
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      if (target === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const result = await fetchMisCobros({
          filters,
          page: target,
          pageSize: PAGE_SIZE,
          collectorId,
          collectorName: isSelf ? null : collector?.full_name || null,
          isSelf,
          online,
        });
        if (id !== requestId.current) return;
        setRows((current) => (target === 1 ? result.rows : [...current, ...result.rows]));
        setSummary(result.summary);
        setPage(target);
        setFromCache(result.fromCache);
        setCierreIgnored(result.cierreFilterIgnored);
        setUnsentCount(result.unsentCount);
        setError(null);
      } catch (e) {
        if (id !== requestId.current) return;
        if (target === 1) {
          setRows([]);
          setSummary(EMPTY_MIS_COBROS_SUMMARY);
        }
        setError(errorMessage(e, 'No fue posible cargar los cobros'));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [collector?.full_name, collectorId, filters, isSelf, online]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const openFilters = () => {
    setDraft(filters);
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setFilters({ ...draft, search: filters.search });
    setFiltersOpen(false);
  };

  const activeFilters = countActiveMisCobrosFilters(filters);
  const range = rangeLabel(filters);
  const selectedMethodNames = paymentMethods
    .filter((method) => filters.paymentMethodIds.includes(method.id))
    .map((method) => method.name);
  const filterSummary = [
    range,
    selectedMethodNames.length ? selectedMethodNames.join(', ') : null,
    filters.site === 'almacen' ? 'Almacén' : filters.site === 'app_movil' ? 'Aplicación Móvil' : filters.site === 'sin_registro' ? 'Sitio no registrado' : null,
    filters.inCierre === 'si' ? 'En un cierre' : filters.inCierre === 'no' ? 'Sin cierre' : null,
  ].filter(Boolean).join(' · ');

  const header = (
    <View style={styles.header}>
      {isAdmin() ? (
        <View style={[styles.collector, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
          <MaterialIcons name="person" size={20} color={colors.primary.main} />
          <View style={styles.collectorText}>
            <Text style={[styles.collectorLabel, { color: colors.text.secondary }]}>Cobrador</Text>
            <Text style={[styles.collectorName, { color: colors.text.primary }]} numberOfLines={1}>
              {isSelf ? 'Mis cobros' : collector?.full_name}
            </Text>
          </View>
          {!isSelf ? <Button title="Los míos" size="sm" variant="ghost" onPress={() => setCollector(null)} /> : null}
          <Button title="Cambiar" size="sm" variant="outline" onPress={() => setPickerOpen(true)} />
        </View>
      ) : null}

      <SearchField
        value={searchInput}
        onChangeText={setSearchInput}
        placeholder="Cliente, cédula o negocio"
        autoCorrect={false}
        accessibilityLabel="Buscar cobros por cliente, cédula o negocio"
      />

      <SegmentedControl
        items={STATUS_SEGMENTS}
        value={filters.status}
        onChange={(value) => setFilters((current) => ({ ...current, status: value as MisCobrosStatus }))}
      />

      <View style={styles.filterRow}>
        <Text style={[styles.filterSummary, { color: colors.text.secondary }]} numberOfLines={2}>
          {filterSummary || 'Todas las fechas y métodos'}
        </Text>
        <Button
          title={activeFilters ? `Filtros (${activeFilters})` : 'Filtros'}
          icon="tune"
          size="sm"
          variant={activeFilters ? 'secondary' : 'outline'}
          onPress={openFilters}
        />
      </View>

      {fromCache ? (
        <View style={[styles.notice, { backgroundColor: `${colors.warning.main}14`, borderColor: colors.warning.main }]}>
          <MaterialIcons name="cloud-off" size={18} color={colors.warning.main} />
          <Text style={[styles.noticeText, { color: colors.text.primary }]}>
            Sin señal: pagos guardados en el teléfono ({formatLocalDataLabel(lastSyncedAt).toLowerCase()}). Los que aún no se envían van marcados.
            {cierreIgnored ? ' El filtro de cierre se aplica al volver la conexión.' : ''}
          </Text>
        </View>
      ) : unsentCount > 0 && isSelf ? (
        <View style={[styles.notice, { backgroundColor: `${colors.info.main}14`, borderColor: colors.info.main }]}>
          <MaterialIcons name="cloud-upload" size={18} color={colors.info.main} />
          <Text style={[styles.noticeText, { color: colors.text.primary }]}>
            {unsentCount === 1 ? 'Hay 1 cobro guardado en el teléfono que aún no se envía' : `Hay ${unsentCount} cobros guardados en el teléfono que aún no se envían`}: aparecerán aquí al sincronizar.
          </Text>
        </View>
      ) : null}

      <Card variant="outlined" style={styles.totals}>
        <Metric label="Total cobrado" value={formatCOP(summary.total_collected)} tone="success" size="md" />
        <View style={styles.totalsRow}>
          <Metric
            label={summary.cash_count == null ? 'Efectivo' : `Efectivo (${summary.cash_count})`}
            value={summary.total_cash == null ? 'Sin dato' : formatCOP(summary.total_cash)}
            style={styles.totalsCell}
          />
          <Metric label="Cobros" value={String(summary.total_count)} style={styles.totalsCell} />
          <Metric label="Anulados" value={String(summary.voided_count)} tone={summary.voided_count ? 'error' : 'default'} style={styles.totalsCell} />
        </View>
        {summary.total_cash == null ? (
          <Text style={[styles.hint, { color: colors.text.secondary }]}>
            Conéctate una vez para saber qué métodos son efectivo.
          </Text>
        ) : null}
      </Card>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={error ? [] : rows}
        keyExtractor={(item) => item.payment_id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(1);
            }}
          />
        }
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <MisCobroCard row={item} onPress={() => router.push(`/negocio/${item.negocio_id}`)} />
        )}
        ListEmptyComponent={
          loading ? (
            <ScreenState loading title="Cargando cobros…" variant="inline" />
          ) : error ? (
            <ScreenState icon="error-outline" tone="error" title="No se pudieron cargar los cobros" description={error} actionLabel="Reintentar" onAction={() => void load(1)} variant="inline" />
          ) : (
            <ScreenState
              icon="receipt-long"
              title="Sin cobros para estos filtros"
              description={fromCache ? 'Sin señal solo se ven los pagos guardados en el teléfono.' : 'Prueba con otras fechas o quita filtros.'}
              variant="inline"
            />
          )
        }
        ListFooterComponent={
          rows.length < summary.total_count && !error ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingMore}
              onPress={() => void load(page + 1)}
              style={[styles.loadMore, { borderColor: colors.divider }]}>
              {loadingMore ? (
                <ActivityIndicator color={colors.primary.main} />
              ) : (
                <Text style={[styles.loadMoreText, { color: colors.primary.main }]}>
                  Cargar más · {rows.length} de {summary.total_count}
                </Text>
              )}
            </Pressable>
          ) : rows.length ? (
            <Text style={[styles.end, { color: colors.text.secondary }]}>
              Mostrando {rows.length} de {summary.total_count} cobros
            </Text>
          ) : null
        }
      />
      <MisCobrosFilterSheet
        visible={filtersOpen}
        values={draft}
        paymentMethods={paymentMethods}
        offline={fromCache || !online}
        onChange={setDraft}
        onApply={applyFilters}
        onClose={() => setFiltersOpen(false)}
      />
      {isAdmin() ? (
        <CollectionManagerPicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(manager) => {
            setCollector(manager);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, flexGrow: 1 },
  header: { gap: Spacing.md, marginBottom: Spacing.lg },
  collector: { minHeight: 56, borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  collectorText: { flex: 1 },
  collectorLabel: { ...Typography.label },
  collectorName: { ...Typography.bodyStrong },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  filterSummary: { ...Typography.metadata, flex: 1 },
  notice: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', borderWidth: 1, borderRadius: Radius.control, padding: Spacing.md },
  noticeText: { ...Typography.caption, flex: 1 },
  totals: { gap: Spacing.md },
  totalsRow: { flexDirection: 'row', gap: Spacing.md },
  totalsCell: { flex: 1 },
  hint: { ...Typography.caption },
  separator: { height: Spacing.md },
  loadMore: { minHeight: 50, borderWidth: 1, borderRadius: Radius.control, padding: Spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  loadMoreText: { ...Typography.bodySmallStrong },
  end: { ...Typography.metadata, textAlign: 'center', marginVertical: Spacing.lg },
});
