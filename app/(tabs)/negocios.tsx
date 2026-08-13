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
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { DownloadDataButton } from '@/components/offline';
import { useNegociosStore } from '@/components/negocios/infrastructure/store/negociosStore';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useUserRoles } from '@/hooks/useUserRoles';

export default function NegociosScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { list, loading, fromCache, fetchList } = useNegociosStore();
  const { isAdmin, isVendedor, isGestorCobro } = useUserRoles();
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const canCreate = isAdmin() || isVendedor() || isGestorCobro();
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Negocios</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            style={[styles.cta, { backgroundColor: colors.background.paper, borderWidth: 1, borderColor: colors.divider }]}
            onPress={() => router.push('/(tabs)/buscar-cliente' as any)}
          >
            <MaterialIcons name="person-search" size={22} color={colors.primary.main} />
            <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
              Cliente
            </Text>
          </Pressable>
          {canCreate && (
            <Pressable
              style={[styles.cta, { backgroundColor: colors.primary.main }]}
              onPress={() => router.push('/(tabs)/negocio-create')}
            >
              <MaterialIcons name="add" size={22} color={colors.primary.contrastText} />
              <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                Nuevo
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary.main} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 16 }}>
              <Text style={{ textAlign: 'center', color: colors.text.secondary }}>
                {fromCache
                  ? 'No hay datos locales. Conéctese y pulse Descargar información.'
                  : 'No hay negocios. Crea el primero.'}
              </Text>
              <DownloadDataButton variant="cta" />
            </View>
          }
          ListHeaderComponent={
            fromCache ? (
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 8 }}>
                {formatLocalDataLabel(lastSyncedAt)}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.card,
                { backgroundColor: colors.background.paper, borderColor: colors.divider },
              ]}
              onPress={() => router.push(`/negocio/${item.id}`)}
            >
              <View style={styles.row}>
                <Text style={[styles.numero, { color: colors.text.primary }]}>
                  {formatNegocioCodigo(item.numero)}
                </Text>
                <Text style={{ color: colors.primary.main, fontWeight: '600' }}>
                  {item.status}
                </Text>
              </View>
              <Text style={{ color: colors.text.secondary }}>
                {item.customer?.name || 'Cliente'} · {item.deal_date}
              </Text>
              <Text style={[styles.total, { color: colors.text.primary }]}>
                {formatCOP(Number(item.total_credit))}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                Saldo {formatCOP(Number(item.remaining_balance ?? 0))}
                {item.installments_count != null
                  ? ` · ${item.installments_count} cuotas · ${
                      item.delivery_order_id ? 'OE creada' : 'Sin OE'
                    }`
                  : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  numero: { fontSize: 18, fontWeight: '700' },
  total: { fontSize: 16, fontWeight: '700', marginTop: 4 },
});
