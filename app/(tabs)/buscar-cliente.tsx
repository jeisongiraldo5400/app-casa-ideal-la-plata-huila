import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { SearchField } from '@/components/ui';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import {
  formatNegocioCodigo,
  labelNegocioStatus,
} from '@/lib/negocioLabels';
import {
  labelCustomerNegocioRole,
  searchCustomerNegocios,
  type CustomerNegocioItem,
  type CustomerWithNegocios,
} from '@/lib/negocios/searchCustomerNegocios';

export default function BuscarClienteScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerWithNegocios[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    if (debounced.length < 2) {
      setCustomers([]);
      setError(null);
      setLoading(false);
      setExpandedId(null);
      return;
    }

    setLoading(true);
    setError(null);
    searchCustomerNegocios(debounced)
      .then((rows) => {
        if (cancelled) return;
        setCustomers(rows);
        if (rows.length === 1) {
          setExpandedId(rows[0].customer_id);
        } else {
          setExpandedId(null);
        }
      })
      .catch((e: any) => {
        if (cancelled) return;
        setCustomers([]);
        setError(e?.message || 'No fue posible buscar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const helperText = useMemo(() => {
    if (query.trim().length > 0 && query.trim().length < 2) {
      return 'Escribe al menos 2 caracteres';
    }
    if (!loading && debounced.length >= 2 && !error && customers.length === 0) {
      return 'No se encontraron clientes';
    }
    return null;
  }, [query, loading, debounced, error, customers.length]);

  const openNegocio = (negocioId: string) => {
    router.push(`/negocio/${negocioId}`);
  };

  const renderNegocio = (negocio: CustomerNegocioItem) => (
    <Pressable
      key={negocio.negocio_id}
      style={[
        styles.negocioCard,
        { backgroundColor: colors.background.default, borderColor: colors.divider },
      ]}
      onPress={() => openNegocio(negocio.negocio_id)}
    >
      <View style={styles.negocioTop}>
        <Text style={[styles.negocioCodigo, { color: colors.text.primary }]}>
          {formatNegocioCodigo(negocio.negocio_numero)}
        </Text>
        <View style={styles.badges}>
          {negocio.role_in_negocio !== 'titular' && (
            <View style={[styles.badge, { backgroundColor: `${colors.info.main}22` }]}>
              <Text style={{ color: colors.info.main, fontSize: 11, fontWeight: '800' }}>
                {labelCustomerNegocioRole(negocio.role_in_negocio)}
              </Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: `${colors.primary.main}18` }]}>
            <Text style={{ color: colors.primary.main, fontSize: 11, fontWeight: '800' }}>
              {labelNegocioStatus(negocio.status)}
            </Text>
          </View>
        </View>
      </View>
      <Text style={{ color: colors.text.secondary, fontSize: 12 }} numberOfLines={2}>
        {[negocio.direccion, negocio.municipio_name].filter(Boolean).join(' · ')}
      </Text>
      <View style={styles.negocioMetrics}>
        <View>
          <Text style={styles.metricLabel}>CRÉDITO</Text>
          <Text style={[styles.metricValue, { color: colors.text.primary }]}>
            {formatCOP(negocio.total_credit)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.metricLabel}>SALDO</Text>
          <Text style={[styles.metricValue, { color: colors.text.primary }]}>
            {formatCOP(negocio.remaining_balance)}
          </Text>
        </View>
      </View>
      <View style={styles.openRow}>
        <Text style={{ color: colors.primary.main, fontWeight: '700' }}>Ver negocio</Text>
        <MaterialIcons name="chevron-right" size={20} color={colors.primary.main} />
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <Text style={[styles.header, { color: colors.text.secondary }]}>Consulta negocios como titular o codeudor</Text>
      <SearchField value={query} onChangeText={setQuery} placeholder="Nombre o documento del cliente" autoCapitalize="none" autoCorrect={false} />

      <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 8 }}>
        Busca un cliente para ver los negocios donde es titular o codeudor.
      </Text>

      {loading && (
        <ActivityIndicator color={colors.primary.main} style={{ marginTop: 24 }} />
      )}

      {error && (
        <Text style={{ color: colors.error.main, marginTop: 16 }}>{error}</Text>
      )}

      {helperText && !loading && (
        <Text style={{ color: colors.text.secondary, marginTop: 24, textAlign: 'center' }}>
          {helperText}
        </Text>
      )}

      {!loading && !error && customers.length > 0 && (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.customer_id}
          contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const expanded = expandedId === item.customer_id;
            const count = item.negocios.length;
            return (
              <View
                style={[
                  styles.customerCard,
                  {
                    backgroundColor: colors.background.paper,
                    borderColor: colors.divider,
                  },
                ]}
              >
                <Pressable
                  onPress={() =>
                    setExpandedId(expanded ? null : item.customer_id)
                  }
                  style={styles.customerHeader}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.customerName, { color: colors.text.primary }]}>
                      {item.customer_name}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                      {item.customer_id_number || 'Sin documento'}
                      {item.customer_phone ? ` · ${item.customer_phone}` : ''}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                      {count === 0
                        ? 'Sin negocios visibles para tu usuario'
                        : `${count} negocio${count === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                  <MaterialIcons
                    name={expanded ? 'expand-less' : 'expand-more'}
                    size={26}
                    color={colors.text.secondary}
                  />
                </Pressable>

                {expanded && (
                  <View style={styles.negociosWrap}>
                    {count === 0 ? (
                      <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                        Este cliente no tiene negocios asignados a tu cartera o permisos.
                      </Text>
                    ) : (
                      item.negocios.map(renderNegocio)
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.xl },
  header: { marginBottom: Spacing.lg },
  customerCard: {
    borderWidth: 1,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  customerName: { fontSize: 16, fontWeight: '800' },
  negociosWrap: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  negocioCard: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: 12,
    gap: 6,
    ...Shadows.card,
  },
  negocioTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  negocioCodigo: { fontSize: 15, fontWeight: '900' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.pill },
  negocioMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  metricValue: { fontSize: 13, fontWeight: '900', marginTop: 2 },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: 2,
  },
});
