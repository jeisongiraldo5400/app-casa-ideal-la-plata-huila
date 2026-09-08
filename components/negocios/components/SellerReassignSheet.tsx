import { useTheme } from '@/components/theme';
import { Button, FullScreenModal, ScreenState, SearchField } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { fetchSellerOptions, type SellerOption } from '@/lib/users/sellersService';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  visible: boolean;
  currentSellerId: string | null;
  saving: boolean;
  onClose: () => void;
  /** Debe resolver cuando el cambio quedó guardado; el llamador notifica errores. */
  onConfirm: (sellerId: string, motivo: string) => Promise<void>;
};

/** Reasignación de vendedor (solo admin): lista buscable de usuarios y motivo. */
export function SellerReassignSheet({ visible, currentSellerId, saving, onClose, onConfirm }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [search, setSearch] = useState('');
  const [motivo, setMotivo] = useState('');
  const [selected, setSelected] = useState('');
  const [options, setOptions] = useState<SellerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setMotivo('');
      setSelected('');
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSellerOptions()
      .then((rows) => {
        if (!cancelled) setOptions(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No fue posible cargar los usuarios');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return options.filter((option) => !term || option.full_name.toLowerCase().includes(term)).slice(0, 50);
  }, [options, search]);

  const canConfirm = Boolean(selected) && selected !== currentSellerId && !saving;

  return (
    <FullScreenModal
      visible={visible}
      onClose={saving ? () => undefined : onClose}
      title="Cambiar vendedor"
      footer={
        <>
          <Button title="Cancelar" variant="outline" onPress={onClose} disabled={saving} style={styles.footerButton} />
          <Button
            title="Guardar"
            onPress={() => void onConfirm(selected, motivo.trim())}
            loading={saving}
            disabled={!canConfirm}
            style={styles.footerButton}
          />
        </>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.helper, { color: colors.text.secondary }]}>
          El nuevo vendedor verá el negocio en su lista y cartera y quedará autorizado para la salida
          de su orden de entrega.
        </Text>
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar usuario" autoCapitalize="none" autoCorrect={false} />
        {loading ? (
          <ScreenState loading title="Cargando usuarios…" variant="inline" />
        ) : error ? (
          <ScreenState tone="error" title="No se pudieron cargar los usuarios" description={error} variant="inline" />
        ) : (
          <View style={[styles.options, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            {filtered.map((option, index) => {
              const isSelected = selected === option.id;
              const isCurrent = option.id === currentSellerId;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isCurrent }}
                  disabled={isCurrent}
                  onPress={() => setSelected(option.id)}
                  style={[styles.option, index === filtered.length - 1 && styles.lastOption, { borderBottomColor: colors.divider }]}>
                  <Text style={[styles.optionText, { color: isCurrent ? colors.text.secondary : colors.text.primary }]}>
                    {option.full_name}
                    {isCurrent ? ' (actual)' : ''}
                  </Text>
                  {isSelected ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
                </Pressable>
              );
            })}
            {!filtered.length ? (
              <Text style={[styles.emptyOption, { color: colors.text.secondary }]}>Sin usuarios para “{search}”</Text>
            ) : null}
          </View>
        )}
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Motivo (opcional)</Text>
          <TextInput
            value={motivo}
            onChangeText={setMotivo}
            multiline
            placeholder="Ej. cambio de zona, vendedor retirado…"
            placeholderTextColor={colors.text.secondary}
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]}
          />
        </View>
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  helper: { ...Typography.caption },
  group: { gap: Spacing.sm },
  label: { ...Typography.label },
  options: { borderWidth: 1, borderRadius: Radius.control, overflow: 'hidden' },
  option: { minHeight: 48, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  lastOption: { borderBottomWidth: 0 },
  optionText: { ...Typography.bodySmall, flex: 1 },
  emptyOption: { ...Typography.caption, padding: Spacing.lg, fontStyle: 'italic' },
  input: { minHeight: 72, borderWidth: 1, borderRadius: Radius.control, padding: Spacing.md, textAlignVertical: 'top' },
  footerButton: { flex: 1 },
});
