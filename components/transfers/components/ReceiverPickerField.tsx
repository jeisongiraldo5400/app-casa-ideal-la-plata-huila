import { useTheme } from '@/components/theme';
import { Button, ModalSheet, SearchField } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { normalizeText } from '@/lib/search/normalizeText';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReceiverOption } from '../utils/transferModel';

type Props = {
  destinationName: string;
  /** Opciones ya sin quien despacha ni el transportador. */
  options: ReceiverOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

/**
 * «¿Quiénes pueden recibir en <bodega>?» (20261231450000): selección
 * múltiple con búsqueda. Solo ellos (y un administrador) podrán recibir y a
 * ellos les llega el aviso de que el traslado va en camino.
 */
export function ReceiverPickerField({ destinationName, options, selectedIds, onChange, disabled = false }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const empty = selected.length === 0;

  const visible = useMemo(() => {
    const term = normalizeText(search);
    return term ? options.filter((option) => normalizeText(option.name).includes(term)) : options;
  }, [options, search]);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((current) => current !== id) : [...selectedIds, id]);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text.primary }]}>¿Quiénes pueden recibir en {destinationName}?</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Elegir quiénes pueden recibir en ${destinationName}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: colors.background.paper,
            borderColor: empty ? colors.error.main : colors.divider,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Text style={[styles.value, { color: empty ? colors.text.secondary : colors.text.primary }]} numberOfLines={3}>
          {empty ? 'Nadie elegido' : selected.map((option) => option.name).join(', ')}
        </Text>
        <MaterialIcons name="group-add" size={22} color={colors.text.primary} />
      </Pressable>
      <Text style={[styles.hint, { color: empty ? colors.error.main : colors.text.secondary }]}>
        {empty
          ? 'Elige al menos una persona. Les llegará un aviso al despachar.'
          : 'Solo ellos (y un administrador) podrán recibir; les llegará un aviso. No apareces tú ni el transportador.'}
      </Text>

      <ModalSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="¿Quiénes pueden recibir?"
        subtitle={`${destinationName} · ${selected.length} elegido${selected.length === 1 ? '' : 's'}`}
        footer={<Button title="Listo" onPress={() => setOpen(false)} style={styles.done} />}
      >
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por nombre…" />
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {visible.length === 0 ? (
            <Text style={[styles.hint, { color: colors.text.secondary }]}>Sin resultados</Text>
          ) : (
            visible.map((option) => {
              const checked = selectedIds.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={option.name}
                  onPress={() => toggle(option.id)}
                  style={[styles.row, { borderColor: colors.divider }]}
                >
                  <MaterialIcons
                    name={checked ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={checked ? colors.primary.main : colors.text.secondary}
                  />
                  <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
                    {option.name}
                  </Text>
                  {option.isManager ? (
                    <Text style={[styles.tag, { color: colors.primary.main, borderColor: colors.primary.main }]}>Encargado</Text>
                  ) : null}
                  {option.isAdmin ? (
                    <Text style={[styles.tag, { color: colors.text.secondary, borderColor: colors.divider }]}>Admin</Text>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
        <Text style={[styles.hint, { color: colors.text.secondary }]}>
          No apareces tú (despachas) ni el transportador: no pueden recibir este traslado.
        </Text>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },
  label: { ...Typography.bodySmallStrong },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.control,
  },
  value: { ...Typography.body, flex: 1 },
  hint: { ...Typography.caption },
  list: { maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { ...Typography.body, flex: 1 },
  tag: { ...Typography.caption, borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.xs },
  done: { flex: 1 },
});
