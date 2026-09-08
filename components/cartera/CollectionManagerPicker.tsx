import { useTheme } from '@/components/theme';
import { FullScreenModal, ScreenState, SearchField } from '@/components/ui';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { searchCollectionManagers, type CollectionManager } from '@/lib/cartera/carteraService';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (manager: CollectionManager) => void;
};

/** Selector de gestor de cobro a pantalla completa, con búsqueda por nombre. */
export function CollectionManagerPicker({ visible, onClose, onSelect }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [search, setSearch] = useState('');
  const [managers, setManagers] = useState<CollectionManager[]>([]);
  const [loading, setLoading] = useState(false);

  // Solo consulta mientras el selector está abierto; al cerrarse se limpia la búsqueda.
  useEffect(() => {
    if (!visible) {
      setSearch('');
      setManagers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchCollectionManagers(search)
        .then((rows) => {
          if (!cancelled) setManagers(rows);
        })
        .catch(() => {
          if (!cancelled) setManagers([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, search]);

  return (
    <FullScreenModal visible={visible} onClose={onClose} title="Seleccionar gestor">
      <View style={styles.searchWrap}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por nombre" autoFocus autoCapitalize="words" autoCorrect={false} />
      </View>
      <FlatList
        data={managers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver cobros de ${item.full_name}`}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.background.paper, borderColor: colors.divider }, pressed && styles.pressed]}>
            <View style={[styles.avatar, { backgroundColor: `${colors.primary.main}16` }]}>
              <MaterialIcons name="person" size={IconSize.md} color={colors.primary.main} />
            </View>
            <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{item.full_name}</Text>
            <MaterialIcons name="chevron-right" size={IconSize.md} color={colors.text.secondary} />
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <ScreenState loading title="Buscando gestores…" variant="inline" />
          ) : (
            <ScreenState icon="person-search" title="No se encontraron gestores" description={search ? 'Prueba con otro nombre.' : undefined} variant="inline" />
          )
        }
      />
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl, flexGrow: 1 },
  separator: { height: Spacing.sm },
  row: { minHeight: 56, borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 36, height: 36, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center' },
  name: { ...Typography.bodyStrong, flex: 1 },
  pressed: { opacity: 0.8 },
});
