import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SearchField } from '@/components/ui';
import { Radius, Spacing, Typography, type getColors } from '@/constants/theme';
import { searchCollectionManagers, type CollectionManager } from '@/lib/cartera/carteraService';

type Props = {
  /** Solo consulta mientras el modal está abierto. */
  active: boolean;
  gestorId: string;
  gestorName: string;
  onChange: (next: { gestorId: string; gestorName: string }) => void;
  colors: ReturnType<typeof getColors>;
};

const DEBOUNCE_MS = 300;

/**
 * Filtro por gestor de cobro (`p_gestor_id`), solo para administradores: los
 * demás roles ya ven únicamente su propia cartera. La lista de gestores se
 * busca en el servidor; sin señal se avisa y el filtro ya elegido se conserva
 * (la base local sí sabe el gestor de cada negocio).
 */
export function CarteraGestorFilter({ active, gestorId, gestorName, onChange, colors }: Props) {
  const [search, setSearch] = useState('');
  const [managers, setManagers] = useState<CollectionManager[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) {
      setSearch('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchCollectionManagers(search)
        .then((rows) => {
          if (cancelled) return;
          setManagers(rows);
          setFailed(false);
        })
        .catch(() => {
          if (cancelled) return;
          setManagers([]);
          setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, search]);

  return (
    <View style={styles.group}>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={gestorName || 'Todos los gestores'}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={[styles.options, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !gestorId }}
          onPress={() => onChange({ gestorId: '', gestorName: '' })}
          style={[styles.option, { borderBottomColor: colors.divider }]}>
          <Text style={[styles.optionText, { color: colors.primary.main, fontWeight: '700' }]}>Todos los gestores</Text>
          {!gestorId ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
        </Pressable>
        {managers.map((manager, index) => {
          const selected = gestorId === manager.id;
          return (
            <Pressable
              key={manager.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange({ gestorId: manager.id, gestorName: manager.full_name })}
              style={[styles.option, index === managers.length - 1 && styles.lastOption, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.optionText, { color: colors.text.primary }]}>{manager.full_name}</Text>
              {selected ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
            </Pressable>
          );
        })}
        {loading && !managers.length ? <ActivityIndicator color={colors.primary.main} style={styles.loading} /> : null}
        {!loading && !managers.length ? (
          <Text style={[styles.empty, { color: colors.text.secondary }]}>
            {failed ? 'Sin conexión: la lista de gestores no está disponible' : `Sin gestores para “${search}”`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  options: { borderWidth: 1, borderRadius: Radius.control, overflow: 'hidden' },
  option: { minHeight: 48, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  lastOption: { borderBottomWidth: 0 },
  optionText: { ...Typography.bodySmall, flex: 1 },
  empty: { ...Typography.caption, padding: Spacing.lg, fontStyle: 'italic' },
  loading: { margin: Spacing.lg },
});
