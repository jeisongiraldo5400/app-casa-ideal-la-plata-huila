import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { DownloadDataButton } from '@/components/offline';
import {
  HeroActionCard,
  ListCard,
  Metric,
  ScreenErrorBoundary,
  ScreenState,
  SearchField,
  SegmentedControl,
  StatusChip,
} from '@/components/ui';
import { useNegociosStore } from '@/components/negocios/infrastructure/store/negociosStore';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo, labelNegocioStatus, negocioStatusTone } from '@/lib/negocioLabels';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useUserRoles } from '@/hooks/useUserRoles';

type Filter = 'all' | 'active' | 'overdue' | 'draft';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'overdue', label: 'En mora' },
  { value: 'draft', label: 'Borradores' },
];

const ACTIVE_STATUSES = ['activo', 'entregado'];
const DRAFT_STATUSES = ['borrador', 'por_firmar'];

function matchesFilter(item: any, filter: Filter) {
  switch (filter) {
    case 'active':
      return ACTIVE_STATUSES.includes(item.status);
    case 'overdue':
      return Boolean(item.has_mora);
    case 'draft':
      return DRAFT_STATUSES.includes(item.status);
    default:
      return true;
  }
}

function matchesQuery(item: any, query: string) {
  if (!query) return true;
  const haystack = `${formatNegocioCodigo(item.numero)} ${item.customer?.name || ''}`.toLowerCase();
  return haystack.includes(query);
}

export default function NegociosScreen() {
  return (
    <ScreenErrorBoundary screen="Negocios">
      <NegociosScreenInner />
    </ScreenErrorBoundary>
  );
}

function NegociosScreenInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { list, loading, fromCache, error, fetchList } = useNegociosStore();
  const { isAdmin, isVendedor, isGestorCobro } = useUserRoles();
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const canCreate = isAdmin() || isVendedor() || isGestorCobro();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(
    useCallback(() => {
      fetchList();
    }, [fetchList])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchList();
    setRefreshing(false);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => list.filter((item) => matchesFilter(item, filter) && matchesQuery(item, normalizedQuery)),
    [list, filter, normalizedQuery]
  );
  const hasFilters = filter !== 'all' || normalizedQuery.length > 0;
  const initialLoading = loading && !refreshing && list.length === 0;

  const renderEmpty = () => {
    if (initialLoading) {
      return <ScreenState loading title="Cargando negocios…" variant="inline" />;
    }
    if (error && list.length === 0) {
      return (
        <ScreenState
          tone="error"
          title="No se pudieron cargar los negocios"
          description={error}
          actionLabel="Reintentar"
          onAction={() => void fetchList()}
        />
      );
    }
    if (hasFilters) {
      return (
        <ScreenState
          icon="filter-list-off"
          title="Sin coincidencias"
          description="Ningún negocio coincide con la búsqueda o el filtro."
          actionLabel="Limpiar filtros"
          onAction={() => {
            setQuery('');
            setFilter('all');
          }}
        />
      );
    }
    if (fromCache) {
      return (
        <ScreenState
          icon="cloud-off"
          title="Sin datos locales"
          description="Conéctese y descargue la información para trabajar sin conexión.">
          <DownloadDataButton variant="cta" />
        </ScreenState>
      );
    }
    return (
      <ScreenState
        icon="handshake"
        title="Aún no hay negocios"
        description={canCreate ? 'Crea el primero para empezar a gestionar créditos.' : 'Cuando se registren negocios aparecerán aquí.'}
        actionLabel={canCreate ? 'Crear negocio' : undefined}
        onAction={canCreate ? () => router.navigate('/(tabs)/negocio-create') : undefined}
      />
    );
  };

  const header = (
    <View style={styles.header}>
      {canCreate ? (
        <HeroActionCard
          compact
          title="Nuevo negocio"
          subtitle="Crédito y orden de entrega"
          icon="add-business"
          onPress={() => router.navigate('/(tabs)/negocio-create')}
        />
      ) : null}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por código o cliente"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <SegmentedControl items={FILTERS} value={filter} onChange={(value) => setFilter(value as Filter)} />
      {fromCache ? (
        <Text style={[styles.notice, { color: colors.text.secondary }]}>{formatLocalDataLabel(lastSyncedAt)}</Text>
      ) : null}
      {error && list.length > 0 ? (
        <Text style={[styles.notice, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
          No se pudo actualizar. Mostrando la última lista cargada.
        </Text>
      ) : null}
      {!initialLoading && list.length > 0 ? (
        <Text style={[styles.count, { color: colors.text.secondary }]}>
          {filtered.length} de {list.length} negocio{list.length === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty()}
        renderItem={({ item }) => {
          const saldo = Number(item.remaining_balance ?? 0);
          const customer = item.customer?.name || 'Cliente';
          const meta = [
            item.deal_date,
            item.installments_count != null ? `${item.installments_count} cuotas` : null,
            item.installments_count != null ? (item.delivery_order_id ? 'OE creada' : 'Sin OE') : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <ListCard
              onPress={() => router.push(`/negocio/${item.id}`)}
              accessibilityLabel={`Negocio ${formatNegocioCodigo(item.numero)}, ${customer}, ${labelNegocioStatus(item.status)}, saldo ${formatCOP(saldo)}`}>
              <View style={styles.cardTop}>
                <Text style={[styles.numero, { color: colors.text.primary }]}>{formatNegocioCodigo(item.numero)}</Text>
                <StatusChip label={labelNegocioStatus(item.status)} tone={negocioStatusTone(item.status)} />
              </View>
              <Text style={[styles.customer, { color: colors.text.primary }]} numberOfLines={1}>{customer}</Text>
              <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>{meta}</Text>
              <View style={[styles.amounts, { borderTopColor: colors.divider }]}>
                <Metric label="Crédito" value={formatCOP(Number(item.total_credit))} />
                <Metric
                  label={item.has_mora ? 'Saldo · en mora' : 'Saldo'}
                  value={formatCOP(saldo)}
                  tone={item.has_mora ? 'error' : saldo <= 0 ? 'success' : 'default'}
                  align="right"
                />
              </View>
            </ListCard>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  header: { gap: Spacing.md, marginBottom: Spacing.lg },
  notice: { ...Typography.metadata },
  count: { ...Typography.metadata, textAlign: 'right' },
  separator: { height: Spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  numero: { ...Typography.bodyStrong, fontWeight: '800' },
  customer: { ...Typography.bodySmall },
  meta: { ...Typography.caption },
  amounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
