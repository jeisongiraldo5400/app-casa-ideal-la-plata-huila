import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { createCollectionRoute, fetchRouteCandidates } from '@/lib/collection-routes/collectionRouteService';
import { moveItem } from '@/lib/collection-routes/routeState';
import { CandidateFilter, CollectionRouteCandidate } from '@/lib/collection-routes/types';
import { fetchMunicipios, Municipio } from '@/lib/cartera/carteraService';
import { localDateValue } from '@/lib/localDate';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const PAGE_SIZE = 20;
const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-CO')}`;

export default function CreateCollectionRouteScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<CandidateFilter>('hoy');
  const [municipioId, setMunicipioId] = useState('');
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [rows, setRows] = useState<CollectionRouteCandidate[]>([]);
  const [selected, setSelected] = useState<CollectionRouteCandidate[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (targetPage: number, append: boolean) => {
    try {
      setLoading(true);
      const result = await fetchRouteCandidates({ search: debouncedSearch, filter, municipioId, page: targetPage, pageSize: PAGE_SIZE });
      setRows((current) => append ? [...current, ...result.rows.filter((row: CollectionRouteCandidate) => !current.some((item) => item.negocio_id === row.negocio_id))] : result.rows);
      setTotal(result.totalCount);
      setPage(targetPage);
    } catch (e: any) {
      Alert.alert('No fue posible cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, municipioId]);

  useEffect(() => { load(1, false); }, [load]);
  useEffect(() => { fetchMunicipios().then(setMunicipios).catch(() => setMunicipios([])); }, []);

  const toggle = (candidate: CollectionRouteCandidate) => {
    setSelected((current) => current.some((item) => item.negocio_id === candidate.negocio_id)
      ? current.filter((item) => item.negocio_id !== candidate.negocio_id)
      : [...current, candidate]);
  };

  const create = async () => {
    if (!selected.length) return Alert.alert('Selecciona negocios', 'Agrega al menos un negocio a la ruta.');
    try {
      setSaving(true);
      const routeId = await createCollectionRoute(selected.map((item) => item.negocio_id), localDateValue());
      router.replace(`/ruta-cobros/${routeId}` as any);
    } catch (e: any) {
      Alert.alert('No se pudo crear la ruta', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (ordering) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <View style={styles.orderHeader}><View><Text style={[styles.title, { color: colors.text.primary }]}>Orden de visitas</Text><Text style={{ color: colors.text.secondary }}>Ajusta el recorrido antes de crearlo.</Text></View><TouchableOpacity onPress={() => setOrdering(false)}><Text style={{ color: colors.primary.main, fontWeight: '900' }}>Volver</Text></TouchableOpacity></View>
        <FlatList
          data={selected}
          keyExtractor={(item) => item.negocio_id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          renderItem={({ item, index }) => (
            <View style={[styles.orderCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
              <View style={[styles.orderNumber, { backgroundColor: colors.primary.main }]}><Text style={{ color: '#fff', fontWeight: '900' }}>{index + 1}</Text></View>
              <View style={{ flex: 1 }}><Text style={{ color: colors.text.primary, fontWeight: '800' }}>{item.customer_name}</Text><Text style={{ color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>{formatNegocioCodigo(item.negocio_numero)} · {item.customer_address}</Text></View>
              <View><TouchableOpacity disabled={index === 0} onPress={() => setSelected(moveItem(selected, index, index - 1))}><MaterialIcons name="keyboard-arrow-up" size={27} color={index === 0 ? colors.divider : colors.primary.main} /></TouchableOpacity><TouchableOpacity disabled={index === selected.length - 1} onPress={() => setSelected(moveItem(selected, index, index + 1))}><MaterialIcons name="keyboard-arrow-down" size={27} color={index === selected.length - 1 ? colors.divider : colors.primary.main} /></TouchableOpacity></View>
            </View>
          )}
        />
        <TouchableOpacity disabled={saving} style={[styles.bottomButton, { backgroundColor: colors.primary.main }]} onPress={create}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.bottomButtonText}>Crear ruta con {selected.length} paradas</Text>}</TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <View style={styles.searchArea}>
        <View style={[styles.searchBox, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}><MaterialIcons name="search" size={22} color={colors.text.secondary} /><TextInput placeholder="Cliente, negocio, cédula o dirección" placeholderTextColor={colors.text.secondary} value={search} onChangeText={setSearch} style={[styles.input, { color: colors.text.primary }]} /></View>
        <View style={styles.filters}>{(['hoy', 'vencidas', 'todas'] as CandidateFilter[]).map((value) => <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.filter, { backgroundColor: filter === value ? colors.primary.main : colors.background.paper, borderColor: colors.divider }]}><Text style={{ color: filter === value ? '#fff' : colors.text.secondary, fontWeight: '800', fontSize: 12 }}>{value === 'hoy' ? 'Para hoy' : value === 'vencidas' ? 'Vencidos' : 'Todos'}</Text></TouchableOpacity>)}</View>
        <View style={[styles.pickerBox, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
          <MaterialIcons name="location-city" size={19} color={colors.text.secondary} />
          <Picker selectedValue={municipioId} onValueChange={setMunicipioId} style={[styles.picker, { color: colors.text.primary }]}>
            <Picker.Item label="Todos los municipios" value="" />
            {municipios.map((municipio) => <Picker.Item key={municipio.id} label={municipio.nombre} value={municipio.id} />)}
          </Picker>
        </View>
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{total} negocios disponibles · {selected.length} seleccionados</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.negocio_id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: selected.length ? 110 : 30 }}
        onEndReached={() => { if (!loading && rows.length < total) load(page + 1, true); }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={loading ? <ActivityIndicator color={colors.primary.main} style={{ margin: 18 }} /> : null}
        ListEmptyComponent={!loading ? <View style={styles.empty}><MaterialIcons name="search-off" size={40} color={colors.text.secondary} /><Text style={{ color: colors.text.secondary }}>No hay negocios para este filtro.</Text></View> : null}
        renderItem={({ item }) => {
          const checked = selected.some((selectedItem) => selectedItem.negocio_id === item.negocio_id);
          return <TouchableOpacity onPress={() => toggle(item)} style={[styles.candidate, { backgroundColor: colors.background.paper, borderColor: checked ? colors.primary.main : colors.divider }]}><MaterialIcons name={checked ? 'check-circle' : 'radio-button-unchecked'} size={25} color={checked ? colors.primary.main : colors.text.secondary} /><View style={{ flex: 1 }}><View style={styles.row}><Text style={{ color: colors.text.primary, fontWeight: '900' }}>{item.customer_name}</Text><Text style={{ color: colors.primary.main, fontWeight: '800' }}>{formatNegocioCodigo(item.negocio_numero)}</Text></View><Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{[item.customer_address, item.municipality_name].filter(Boolean).join(', ')}</Text><View style={[styles.row, { marginTop: 8 }]}><Text style={{ color: colors.text.secondary, fontSize: 11 }}>{item.open_installments} cuota(s) · Próxima {item.next_due_date}</Text><Text style={{ color: colors.text.primary, fontWeight: '900' }}>{money(item.expected_balance)}</Text></View></View></TouchableOpacity>;
        }}
      />
      {selected.length > 0 && <TouchableOpacity style={[styles.bottomButton, { backgroundColor: colors.primary.main }]} onPress={() => setOrdering(true)}><Text style={styles.bottomButtonText}>Ordenar {selected.length} paradas</Text><MaterialIcons name="arrow-forward" size={20} color="#fff" /></TouchableOpacity>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, searchArea: { padding: 16, gap: 10 }, searchBox: { height: 46, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }, input: { flex: 1, marginLeft: 8 }, filters: { flexDirection: 'row', gap: 8 }, filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1 }, pickerBox: { height: 46, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingLeft: 11, overflow: 'hidden' }, picker: { flex: 1, height: 46 }, candidate: { flexDirection: 'row', gap: 11, padding: 14, borderWidth: 1.5, borderRadius: 15 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, empty: { alignItems: 'center', gap: 10, padding: 40 }, bottomButton: { position: 'absolute', left: 18, right: 18, bottom: 18, height: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 5 }, bottomButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' }, orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 }, title: { fontSize: 21, fontWeight: '900' }, orderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 14 }, orderNumber: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
