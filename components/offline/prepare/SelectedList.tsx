import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import {
  listSyncSelection,
  setSyncSelection,
  type SelectionItem,
  type SelectionDomain,
} from '../infrastructure/syncPrefsService';

/** «1 llevada» / «3 llevadas» (solo las órdenes se eligen una a una). */
export function carriedLabel(count: number) {
  return `${count} ${count === 1 ? 'llevada' : 'llevadas'}`;
}

const LIST_PAGE = 10;

/** Lo elegido uno a uno, con nombre y «Quitar», paginado. */
export function SelectedList({
  domain,
  count,
  disabled,
}: {
  domain: SelectionDomain;
  count: number;
  disabled: boolean;
}) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const page = await listSyncSelection(domain, LIST_PAGE, offset);
        setItems((current) => (offset === 0 ? page : [...current, ...page]));
        setHasMore(page.length === LIST_PAGE);
        setError(null);
      } catch (err) {
        setError(errorMessage(err, 'No se pudo cargar la lista'));
      } finally {
        setLoading(false);
      }
    },
    [domain]
  );

  useEffect(() => {
    if (disabled || count === 0) return;
    void load(0);
  }, [load, count, disabled]);

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await setSyncSelection(domain, [id], false);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      Alert.alert('No se pudo quitar del teléfono', errorMessage(err, 'Inténtalo de nuevo.'));
    } finally {
      setRemoving(null);
    }
  };

  if (count === 0) {
    return (
      <Text style={[styles.caption, { color: colors.text.secondary }]}>
        Aún no llevas órdenes.
      </Text>
    );
  }
  if (disabled) return null;

  return (
    <View style={styles.list} testID={`selected-list-${domain}`}>
      {error ? <Text style={[styles.caption, { color: colors.error.main }]}>{error}</Text> : null}
      {items.map((item) => (
        <View key={item.id} style={[styles.row, { borderColor: colors.divider }]}>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: colors.text.primary }]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.detail ? (
              <Text style={[styles.caption, { color: colors.text.secondary }]} numberOfLines={1}>
                {item.detail}
              </Text>
            ) : null}
          </View>
          <Button
            title="Quitar"
            variant="ghost"
            size="sm"
            loading={removing === item.id}
            disabled={removing !== null}
            onPress={() => void remove(item.id)}
            accessibilityLabel={`Quitar ${item.label} del teléfono`}
          />
        </View>
      ))}
      {loading ? <ActivityIndicator color={colors.primary.main} /> : null}
      {hasMore && !loading ? (
        <Button title="Ver más" variant="ghost" size="sm" onPress={() => void load(items.length)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { ...Typography.caption },
  label: { ...Typography.bodySmallStrong },
  list: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, paddingTop: Spacing.sm },
  flex: { flex: 1 },
});
