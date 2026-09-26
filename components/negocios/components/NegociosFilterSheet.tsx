import { LocationCascadeFields } from '@/components/locations/LocationCascadeFields';
import { useTheme } from '@/components/theme';
import { ActionBar, Button, FullScreenModal } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import type { LocationMasters } from '@/lib/locations/locationsService';
import {
  DEFAULT_NEGOCIOS_LIST_FILTERS,
  NEGOCIO_COBRO_FILTER_OPTIONS,
  NEGOCIO_DUE_DAYS_OPTIONS,
  NEGOCIOS_ORDER_OPTIONS,
  statusOptionsForScope,
  type NegociosListFilters,
  type NegociosScope,
} from '@/lib/negocios/negociosListQuery';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  scope: NegociosScope;
  value: NegociosListFilters;
  masters: LocationMasters;
  mastersLoading?: boolean;
  onApply: (next: NegociosListFilters) => void;
  onClose: () => void;
};

/**
 * Filtros de Negocios: ubicación, estado, cobro y orden. Se edita un borrador
 * y sólo «Aplicar» consulta: cambiar tres cosas no dispara tres consultas.
 */
export function NegociosFilterSheet({ visible, scope, value, masters, mastersLoading, onApply, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [draft, setDraft] = useState<NegociosListFilters>(value);

  // Cada vez que se abre parte de lo aplicado.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const patch = (next: Partial<NegociosListFilters>) => setDraft((prev) => ({ ...prev, ...next }));

  const chip = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? colors.primary.main : colors.divider,
          backgroundColor: selected ? `${colors.primary.main}14` : colors.background.paper,
        },
        pressed && styles.pressed,
      ]}>
      {selected ? <MaterialIcons name="check" size={16} color={colors.primary.main} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.primary.main : colors.text.primary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Filtrar negocios"
      footer={
        <ActionBar>
          <View style={styles.footer}>
            <Button
              title="Limpiar"
              variant="outline"
              onPress={() => setDraft({ ...DEFAULT_NEGOCIOS_LIST_FILTERS, order: draft.order })}
              style={styles.footerButton}
            />
            <Button title="Aplicar" onPress={() => onApply(draft)} style={styles.footerButton} />
          </View>
        </ActionBar>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.group}>
          <Text style={[styles.section, { color: colors.text.primary }]}>Ubicación</Text>
          <Text style={[styles.hint, { color: colors.text.secondary }]}>
            {mastersLoading
              ? 'Cargando los municipios…'
              : 'La del negocio; si no tiene, la del cliente.'}
          </Text>
          <LocationCascadeFields
            masters={masters}
            mastersLoading={mastersLoading}
            value={draft}
            onChange={(next) => patch(next)}
            colors={colors}
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.section, { color: colors.text.primary }]}>Estado</Text>
          <View style={styles.chips}>
            {statusOptionsForScope(scope).map((option) =>
              chip(`status-${option.value}`, option.label, draft.status === option.value, () => patch({ status: option.value }))
            )}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.section, { color: colors.text.primary }]}>Cobro</Text>
          <View style={styles.chips}>
            {NEGOCIO_COBRO_FILTER_OPTIONS.map((option) =>
              chip(`cobro-${option.value}`, option.label, draft.cobro === option.value, () => patch({ cobro: option.value }))
            )}
          </View>
          {draft.cobro === 'por_vencer' ? (
            <>
              <Text style={[styles.hint, { color: colors.text.secondary }]}>Con una cuota que vence en los próximos…</Text>
              <View style={styles.chips}>
                {NEGOCIO_DUE_DAYS_OPTIONS.map((days) =>
                  chip(`days-${days}`, `${days} días`, draft.days === days, () => patch({ days }))
                )}
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.group}>
          <Text style={[styles.section, { color: colors.text.primary }]}>Ordenar por</Text>
          <View style={styles.chips}>
            {NEGOCIOS_ORDER_OPTIONS.map((option) =>
              chip(`order-${option.value}`, option.label, draft.order === option.value, () => patch({ order: option.value }))
            )}
          </View>
        </View>
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.xxl, paddingBottom: Spacing.xxxl },
  group: { gap: Spacing.md },
  section: { ...Typography.bodyStrong },
  hint: { ...Typography.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: Radius.chip },
  chipText: { ...Typography.bodySmallStrong },
  footer: { flexDirection: 'row', gap: Spacing.md },
  footerButton: { flex: 1 },
  pressed: { opacity: 0.8 },
});
