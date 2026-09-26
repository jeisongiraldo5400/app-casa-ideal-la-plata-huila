import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { SearchField } from '@/components/ui';
import { getColors } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  addAllToSelection,
  CANDIDATE_FILTER_OPTIONS,
  countActiveLocationFilters,
  formatCandidatePlace,
  isSelected,
  MAX_ROUTE_STOPS,
  removeFromSelection,
  toggleSelection,
  type LocationNames,
  type SelectableStop,
} from '@/lib/collection-routes/candidates';
import {
  createCollectionRoute,
  fetchAllRouteCandidates,
  fetchCollectionRoute,
  fetchRouteCandidates,
  setCollectionRouteStops,
} from '@/lib/collection-routes/collectionRouteService';
import { isFinalStopStatus, moveItem } from '@/lib/collection-routes/routeState';
import {
  EMPTY_ROUTE_LOCATION_FILTER,
  type CandidateFilter,
  type CandidateQuery,
  type CollectionRouteCandidate,
  type RouteLocationFilter,
} from '@/lib/collection-routes/types';
import { errorMessage } from '@/lib/errorMessage';
import { localDateValue } from '@/lib/localDate';
import { fetchLocationMasters } from '@/lib/locations/locationsService';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { fetchLocationCatalogsFromLocal } from '@/lib/offline/repositories/catalogRepository';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteLocationFilterModal } from './RouteLocationFilterModal';

const PAGE_SIZE = 30;
const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-CO')}`;
const shortDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

type Stop = SelectableStop & { expected_balance?: number };

function toStop(candidate: CollectionRouteCandidate): Stop {
  return {
    negocio_id: candidate.negocio_id,
    negocio_numero: candidate.negocio_numero,
    customer_name: candidate.customer_name,
    customer_address: candidate.customer_address,
    municipality_name: candidate.municipality_name,
    vereda_name: candidate.vereda_name ?? null,
    expected_balance: candidate.expected_balance,
  };
}

/**
 * Armar la ruta de cobro: todos los negocios asignados al gestor, con buscador,
 * estado (en mora / vence pronto / al día) y ubicación; se eligen libremente y
 * se ordenan antes de guardar. Con `editRouteId` edita las paradas de una ruta
 * en borrador o en curso (las visitas ya atendidas no se pueden quitar).
 *
 * Sin señal la lista sale de lo descargado en el teléfono y la selección se
 * conserva; guardar la ruta necesita señal.
 */
export function RouteBuilderScreen({ editRouteId }: { editRouteId?: string }) {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const online = useNetworkStatus();
  const editing = Boolean(editRouteId);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<CandidateFilter>('todas');
  const [location, setLocation] = useState<RouteLocationFilter>(EMPTY_ROUTE_LOCATION_FILTER);
  const [masters, setMasters] = useState<LocationNames>({ departamentos: [], municipios: [], veredas: [] });
  const [mastersLoading, setMastersLoading] = useState(false);
  const [showLocation, setShowLocation] = useState(false);

  const [rows, setRows] = useState<CollectionRouteCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [source, setSource] = useState<'servidor' | 'local'>('servidor');
  const [locationIgnored, setLocationIgnored] = useState(false);

  const [selected, setSelected] = useState<Stop[]>([]);
  const [step, setStep] = useState<'elegir' | 'ordenar'>(editing ? 'ordenar' : 'elegir');
  const [saving, setSaving] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [editLoading, setEditLoading] = useState(editing);
  const requestSeq = useRef(0);

  const query: CandidateQuery = useMemo(
    () => ({ search: debouncedSearch, filter, location }),
    [debouncedSearch, filter, location]
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      const seq = ++requestSeq.current;
      try {
        setLoading(true);
        setListError('');
        const result = await fetchRouteCandidates({ query, page: targetPage, pageSize: PAGE_SIZE, userId, offline: !online });
        if (seq !== requestSeq.current) return;
        setRows((current) =>
          append
            ? [...current, ...result.rows.filter((row) => !current.some((item) => item.negocio_id === row.negocio_id))]
            : result.rows
        );
        setTotal(result.totalCount);
        setPage(targetPage);
        setSource(result.source);
        setLocationIgnored(Boolean(result.locationFilterIgnored));
      } catch (e: unknown) {
        if (seq !== requestSeq.current) return;
        // Error en la lista, no una alerta: cambiar un filtro sin señal no
        // debe abrir un aviso tras otro.
        if (!append) setRows([]);
        setListError(errorMessage(e, 'No fue posible cargar los negocios'));
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [online, query, userId]
  );

  // Al volver a la pantalla (saldos que cambiaron por cobros) y al cambiar
  // filtros o la señal, se recarga la primera página.
  useFocusEffect(
    useCallback(() => {
      void load(1, false);
    }, [load])
  );

  useEffect(() => {
    let active = true;
    setMastersLoading(true);
    const loadMasters = online ? fetchLocationMasters() : Promise.reject(new Error('offline'));
    loadMasters
      .catch(() => fetchLocationCatalogsFromLocal())
      .then((value) => {
        if (active) setMasters(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setMastersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [online]);

  // Edición: se parte de las paradas actuales, en su orden.
  useEffect(() => {
    if (!editRouteId) return;
    let active = true;
    setEditLoading(true);
    fetchCollectionRoute(editRouteId)
      .then((route) => {
        if (!active) return;
        setSelected(
          route.stops.map((stop) => ({
            negocio_id: stop.negocio_id,
            negocio_numero: stop.negocio_numero,
            customer_name: stop.customer_name,
            customer_address: stop.customer_address,
            municipality_name: stop.municipality_name,
            expected_balance: stop.expected_balance,
            locked: isFinalStopStatus(stop.status),
          }))
        );
      })
      .catch((e: unknown) => {
        if (active) Alert.alert('No fue posible cargar la ruta', errorMessage(e, 'No fue posible cargar la ruta'));
      })
      .finally(() => {
        if (active) setEditLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editRouteId]);

  const allFilteredSelected = rows.length > 0 && total <= rows.length && rows.every((row) => isSelected(selected, row.negocio_id));

  const selectAllFiltered = async () => {
    try {
      setSelectingAll(true);
      const result = await fetchAllRouteCandidates({ query, userId, offline: !online });
      const next = addAllToSelection(selected, result.rows.map(toStop));
      setSelected(next);
      if (result.totalCount > MAX_ROUTE_STOPS || next.length >= MAX_ROUTE_STOPS) {
        Alert.alert('Tope de la ruta', `Una ruta admite máximo ${MAX_ROUTE_STOPS} paradas.`);
      }
    } catch (e: unknown) {
      Alert.alert('No fue posible seleccionar', errorMessage(e, 'No fue posible seleccionar los negocios'));
    } finally {
      setSelectingAll(false);
    }
  };

  const unselectFiltered = () => setSelected(removeFromSelection(selected, rows.map((row) => row.negocio_id)));

  const save = async () => {
    if (!selected.length) {
      Alert.alert('Selecciona negocios', 'Agrega al menos un negocio a la ruta.');
      return;
    }
    try {
      setSaving(true);
      const ids = selected.map((item) => item.negocio_id);
      if (editRouteId) {
        await setCollectionRouteStops(editRouteId, ids);
        if (router.canGoBack()) router.back();
        else router.replace(`/ruta-cobros/${editRouteId}` as never);
        return;
      }
      const routeId = await createCollectionRoute(ids, localDateValue());
      // La pestaña conserva su estado: se limpia para la próxima ruta.
      setSelected([]);
      setStep('elegir');
      setSearch('');
      router.replace(`/ruta-cobros/${routeId}?nueva=1` as never);
    } catch (e: unknown) {
      Alert.alert(
        editing ? 'No se pudieron guardar las paradas' : 'No se pudo crear la ruta',
        errorMessage(e, 'No se pudo guardar la ruta')
      );
    } finally {
      setSaving(false);
    }
  };

  const locationCount = countActiveLocationFilters(location);
  const saveLabel = !online
    ? 'Sin señal: guarda cuando vuelva la conexión'
    : editing
      ? `Guardar ${selected.length} paradas`
      : `Crear ruta con ${selected.length} paradas`;

  if (editLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background.default }]}>
        <ActivityIndicator color={colors.primary.main} />
      </View>
    );
  }

  if (step === 'ordenar') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <View style={styles.orderHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text.primary }]}>Orden de visitas</Text>
            <Text style={{ color: colors.text.secondary }}>
              {selected.length} {selected.length === 1 ? 'parada' : 'paradas'} · usa las flechas para ordenar.
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setStep('elegir')}
            style={[styles.addMore, { borderColor: colors.primary.main }]}>
            <MaterialIcons name="add" size={18} color={colors.primary.main} />
            <Text style={{ color: colors.primary.main, fontWeight: '800' }}>Agregar negocios</Text>
          </TouchableOpacity>
        </View>
        {!online ? (
          <View style={{ paddingHorizontal: 16 }}>
            <OfflineNotice colors={colors} text="Sin señal: puedes ordenar, pero la ruta se guarda cuando vuelva la conexión." />
          </View>
        ) : null}
        <FlatList
          data={selected}
          keyExtractor={(item) => item.negocio_id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="add-road" size={40} color={colors.text.secondary} />
              <Text style={{ color: colors.text.secondary, textAlign: 'center' }}>La ruta no tiene paradas. Agrega negocios.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.orderCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
              <View style={[styles.orderNumber, { backgroundColor: item.locked ? colors.text.secondary : colors.primary.main }]}>
                <Text style={{ color: '#fff', fontWeight: '900' }}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontWeight: '800' }} numberOfLines={1}>{item.customer_name}</Text>
                <Text style={{ color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>
                  {formatNegocioCodigo(item.negocio_numero)} · {[item.customer_address, formatCandidatePlace(item)].filter(Boolean).join(', ')}
                </Text>
                {item.locked ? <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }}>Visita ya atendida</Text> : null}
              </View>
              <View>
                <TouchableOpacity
                  accessibilityLabel={`Subir ${item.customer_name}`}
                  disabled={index === 0}
                  onPress={() => setSelected(moveItem(selected, index, index - 1))}>
                  <MaterialIcons name="keyboard-arrow-up" size={27} color={index === 0 ? colors.divider : colors.primary.main} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel={`Bajar ${item.customer_name}`}
                  disabled={index === selected.length - 1}
                  onPress={() => setSelected(moveItem(selected, index, index + 1))}>
                  <MaterialIcons name="keyboard-arrow-down" size={27} color={index === selected.length - 1 ? colors.divider : colors.primary.main} />
                </TouchableOpacity>
              </View>
              {item.locked ? (
                <MaterialIcons name="lock" size={22} color={colors.text.secondary} />
              ) : (
                <TouchableOpacity
                  accessibilityLabel={`Quitar ${item.customer_name}`}
                  hitSlop={8}
                  onPress={() => setSelected(toggleSelection(selected, item))}>
                  <MaterialIcons name="close" size={22} color={colors.error.main} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
        <TouchableOpacity
          testID="route-builder-save"
          disabled={saving || !online || !selected.length}
          accessibilityState={{ disabled: saving || !online || !selected.length }}
          style={[styles.bottomButton, { backgroundColor: colors.primary.main, opacity: online && selected.length ? 1 : 0.6 }]}
          onPress={save}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.bottomButtonText}>{saveLabel}</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <View style={styles.searchArea}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Cliente, cédula o número de negocio" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {CANDIDATE_FILTER_OPTIONS.map((option) => {
            const active = filter === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(option.value)}
                style={[styles.filter, { backgroundColor: active ? colors.primary.main : colors.background.paper, borderColor: colors.divider }]}>
                <Text style={{ color: active ? '#fff' : colors.text.secondary, fontWeight: '800', fontSize: 12 }}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setShowLocation(true)}
            style={[styles.filter, styles.locationChip, { backgroundColor: locationCount ? colors.primary.main : colors.background.paper, borderColor: colors.divider }]}>
            <MaterialIcons name="place" size={15} color={locationCount ? '#fff' : colors.text.secondary} />
            <Text style={{ color: locationCount ? '#fff' : colors.text.secondary, fontWeight: '800', fontSize: 12 }}>
              {locationCount ? `Ubicación (${locationCount})` : 'Ubicación'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        {source === 'local' ? (
          <OfflineNotice
            colors={colors}
            text="Sin señal: ves los negocios descargados en el teléfono. Tu selección se conserva y la ruta se guarda cuando vuelva la conexión."
          />
        ) : null}
        {locationIgnored ? (
          <Text style={{ color: colors.warning.dark, fontSize: 12 }}>
            El servidor todavía no filtra por departamento ni vereda: se muestran todos los del municipio.
          </Text>
        ) : null}
        <View style={styles.row}>
          <Text style={{ color: colors.text.secondary, fontSize: 12, flex: 1 }}>
            {`${total} ${total === 1 ? 'negocio' : 'negocios'} · ${selected.length} en la ruta`}
          </Text>
          {total > 0 ? (
            allFilteredSelected ? (
              <TouchableOpacity accessibilityRole="button" onPress={unselectFiltered}>
                <Text style={{ color: colors.primary.main, fontWeight: '800', fontSize: 12 }}>Quitar los filtrados</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity accessibilityRole="button" disabled={selectingAll} onPress={() => void selectAllFiltered()}>
                {selectingAll ? (
                  <ActivityIndicator size="small" color={colors.primary.main} />
                ) : (
                  <Text style={{ color: colors.primary.main, fontWeight: '800', fontSize: 12 }}>
                    {`Seleccionar los ${Math.min(total, MAX_ROUTE_STOPS)} filtrados`}
                  </Text>
                )}
              </TouchableOpacity>
            )
          ) : null}
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.negocio_id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, paddingBottom: selected.length ? 110 : 30 }}
        onEndReached={() => {
          if (!loading && !listError && rows.length < total) void load(page + 1, true);
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={loading ? <ActivityIndicator color={colors.primary.main} style={{ margin: 18 }} /> : null}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <MaterialIcons name={listError ? 'cloud-off' : 'search-off'} size={40} color={colors.text.secondary} />
              <Text style={{ color: colors.text.secondary, textAlign: 'center' }}>
                {listError || 'No hay negocios asignados con este filtro.'}
              </Text>
              {listError ? (
                <TouchableOpacity onPress={() => void load(1, false)}>
                  <Text style={{ color: colors.primary.main, fontWeight: '800' }}>Reintentar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const checked = isSelected(selected, item.negocio_id);
          const place = formatCandidatePlace(item);
          return (
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => setSelected(toggleSelection(selected, toStop(item)))}
              style={[styles.candidate, { backgroundColor: colors.background.paper, borderColor: checked ? colors.primary.main : colors.divider }]}>
              <MaterialIcons name={checked ? 'check-circle' : 'radio-button-unchecked'} size={25} color={checked ? colors.primary.main : colors.text.secondary} />
              <View style={{ flex: 1 }}>
                <View style={styles.row}>
                  <Text style={{ color: colors.text.primary, fontWeight: '900', flex: 1 }} numberOfLines={1}>{item.customer_name}</Text>
                  <Text style={{ color: colors.primary.main, fontWeight: '800' }}>{formatNegocioCodigo(item.negocio_numero)}</Text>
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 3 }} numberOfLines={2}>
                  {[item.customer_address, place].filter(Boolean).join(' · ')}
                </Text>
                <View style={[styles.row, { marginTop: 8, alignItems: 'center' }]}>
                  {item.overdue_balance > 0 ? (
                    <Text style={{ color: colors.error.main, fontSize: 11, fontWeight: '800', flex: 1 }}>
                      En mora {money(item.overdue_balance)}
                    </Text>
                  ) : (
                    <Text style={{ color: colors.text.secondary, fontSize: 11, flex: 1 }}>
                      {item.open_installments} {item.open_installments === 1 ? 'cuota' : 'cuotas'} · vence {shortDate(item.next_due_date)}
                    </Text>
                  )}
                  <Text style={{ color: colors.text.primary, fontWeight: '900' }}>{money(item.expected_balance)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      {selected.length > 0 && (
        <TouchableOpacity
          testID="route-builder-review"
          style={[styles.bottomButton, { backgroundColor: colors.primary.main }]}
          onPress={() => setStep('ordenar')}>
          <Text style={styles.bottomButtonText}>
            {editing ? `Volver al orden (${selected.length})` : `Ordenar ${selected.length} ${selected.length === 1 ? 'parada' : 'paradas'}`}
          </Text>
          <MaterialIcons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      )}
      <RouteLocationFilterModal
        visible={showLocation}
        masters={masters}
        loading={mastersLoading}
        value={location}
        onChange={setLocation}
        onClose={() => setShowLocation(false)}
      />
    </View>
  );
}

function OfflineNotice({ colors, text }: { colors: ReturnType<typeof getColors>; text: string }) {
  return (
    <View style={[styles.offlineNotice, { borderColor: colors.warning.main, backgroundColor: `${colors.warning.main}1a` }]}>
      <MaterialIcons name="cloud-off" size={20} color={colors.warning.dark} />
      <Text style={{ color: colors.text.primary, flex: 1, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchArea: { padding: 16, gap: 10 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  locationChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  candidate: { flexDirection: 'row', gap: 11, padding: 14, borderWidth: 1.5, borderRadius: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  empty: { alignItems: 'center', gap: 10, padding: 40 },
  offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderWidth: 1, borderRadius: 12, marginHorizontal: 0 },
  bottomButton: { position: 'absolute', left: 18, right: 18, bottom: 18, minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, elevation: 5 },
  bottomButtonText: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 18, paddingBottom: 8 },
  title: { fontSize: 21, fontWeight: '900' },
  addMore: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  orderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 14 },
  orderNumber: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
