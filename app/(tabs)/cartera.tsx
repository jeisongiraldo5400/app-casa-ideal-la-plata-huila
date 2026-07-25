import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { formatCOP } from '@/lib/creditCalculator';

type Row = {
  cuota_id: string;
  negocio_id: string;
  negocio_numero: number;
  customer_name: string | null;
  installment_number: number;
  due_date: string;
  saldo: number;
  status: string;
};

const FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'por_vencer', label: 'Por vencer' },
  { id: 'vencidas', label: 'Vencidas' },
  { id: 'mora', label: 'Mora' },
] as const;

export default function CarteraScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('todas');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      await supabase.rpc('mark_cuotas_en_mora', { p_negocio_id: null });
      const { data, error } = await supabase.rpc('get_cartera_cuotas', {
        p_filter: filter,
        p_days: 15,
        p_search: '',
        p_page: 1,
        p_page_size: 50,
      });
      if (error) throw error;
      setRows(
        (data || []).map((r: any) => ({
          cuota_id: r.cuota_id,
          negocio_id: r.negocio_id,
          negocio_numero: r.negocio_numero,
          customer_name: r.customer_name,
          installment_number: r.installment_number,
          due_date: r.due_date,
          saldo: Number(r.saldo),
          status: r.status,
        }))
      );
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const totalSaldo = rows.reduce((s, r) => s + r.saldo, 0);
  const moraCount = rows.filter((r) => r.status === 'mora').length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Cartera</Text>
      <Text style={{ color: colors.text.secondary, marginBottom: 8 }}>
        Saldo {formatCOP(totalSaldo)} · {moraCount} en mora
      </Text>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  filter === f.id ? colors.primary.main : colors.background.paper,
              },
            ]}
          >
            <Text
              style={{
                color:
                  filter === f.id
                    ? colors.primary.contrastText
                    : colors.text.primary,
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary.main} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.cuota_id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={
            <Text
              style={{
                textAlign: 'center',
                marginTop: 40,
                color: colors.text.secondary,
              }}
            >
              Sin cuotas en este filtro
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/negocio/${item.negocio_id}`)}
              style={[
                styles.row,
                {
                  backgroundColor: colors.background.paper,
                  borderLeftColor:
                    item.status === 'mora' ? colors.error.main : colors.primary.main,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
                  #{item.negocio_numero} · cuota {item.installment_number}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                  {item.customer_name || 'Cliente'} · vence {item.due_date}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
                  {formatCOP(item.saldo)}
                </Text>
                <Text
                  style={{
                    color:
                      item.status === 'mora'
                        ? colors.error.main
                        : colors.text.secondary,
                    fontSize: 12,
                  }}
                >
                  {item.status === 'mora'
                    ? 'En mora'
                    : item.status === 'parcial'
                      ? 'Parcial'
                      : 'Pendiente'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 8,
    borderRadius: 10,
    borderLeftWidth: 4,
    gap: 8,
  },
});
