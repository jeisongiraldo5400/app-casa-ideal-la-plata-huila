import { useTheme } from '@/components/theme';
import { Button, FullScreenModal, SearchField, SegmentedControl } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import type { CarteraFilter, Municipio } from '@/lib/cartera/carteraService';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type CarteraFilterValues = {
  filter: CarteraFilter;
  search: string;
  municipioId: string;
  days: number;
  searchMunicipio: string;
};

type Props = {
  visible: boolean;
  municipios: Municipio[];
  values: CarteraFilterValues;
  onChange: (next: CarteraFilterValues) => void;
  onClose: () => void;
};

const FILTERS: { id: CarteraFilter; label: string }[] = [
  { id: 'todas', label: 'Todas abiertas' },
  { id: 'por_vencer', label: 'Por vencer' },
  { id: 'vencidas', label: 'Vencidas' },
  { id: 'mora', label: 'En mora' },
];

const DAYS = [7, 15, 30].map((days) => ({ value: String(days), label: `${days} días` }));

export const DEFAULT_CARTERA_FILTERS: CarteraFilterValues = {
  filter: 'todas',
  search: '',
  municipioId: '',
  days: 15,
  searchMunicipio: '',
};

/** Filtros de cartera a pantalla completa (estado, búsqueda, municipio, días). */
export function CarteraFilterModal({ visible, municipios, values, onChange, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const selectedMunicipio = municipios.find((item) => item.id === values.municipioId);
  const searchMunicipio = values.searchMunicipio || '';
  const available = municipios
    .filter((item) => item.nombre.toLowerCase().includes(searchMunicipio.toLowerCase()))
    .slice(0, 30);
  const patch = (next: Partial<CarteraFilterValues>) => onChange({ ...values, ...next });

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Filtros de cartera"
      footer={
        <>
          <Button title="Limpiar" variant="outline" onPress={() => onChange(DEFAULT_CARTERA_FILTERS)} style={styles.footerButton} />
          <Button title="Aplicar filtros" onPress={onClose} style={styles.footerButton} />
        </>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Estado de la cuota</Text>
          <View style={styles.chips}>
            {FILTERS.map((item) => {
              const selected = values.filter === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ filter: item.id })}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: selected ? colors.primary.main : colors.divider, backgroundColor: selected ? colors.primary.main : colors.background.paper },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, { color: selected ? colors.primary.contrastText : colors.text.primary }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {values.filter === 'por_vencer' ? (
          <View style={styles.group}>
            <Text style={[styles.label, { color: colors.text.secondary }]}>Días para vencer</Text>
            <SegmentedControl items={DAYS} value={String(values.days)} onChange={(value) => patch({ days: Number(value) })} />
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Buscar cuota</Text>
          <SearchField
            value={values.search}
            onChangeText={(search) => patch({ search })}
            placeholder="Negocio, cliente o documento"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Municipio</Text>
          <SearchField
            value={searchMunicipio}
            onChangeText={(value) => patch({ searchMunicipio: value })}
            placeholder={selectedMunicipio?.nombre || 'Todos los municipios'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={[styles.options, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !values.municipioId }}
              onPress={() => patch({ municipioId: '', searchMunicipio: '' })}
              style={[styles.option, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.optionText, { color: colors.primary.main, fontWeight: '700' }]}>Todos los municipios</Text>
              {!values.municipioId ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
            </Pressable>
            {available.map((municipio, index) => {
              const selected = values.municipioId === municipio.id;
              return (
                <Pressable
                  key={municipio.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ municipioId: municipio.id, searchMunicipio: municipio.nombre })}
                  style={[styles.option, index === available.length - 1 && styles.lastOption, { borderBottomColor: colors.divider }]}>
                  <Text style={[styles.optionText, { color: colors.text.primary }]}>{municipio.nombre}</Text>
                  {selected ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
                </Pressable>
              );
            })}
            {!available.length ? (
              <Text style={[styles.emptyOption, { color: colors.text.secondary }]}>Sin municipios para “{searchMunicipio}”</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.xl, paddingBottom: Spacing.xxl },
  group: { gap: Spacing.sm },
  label: { ...Typography.label },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  chipText: { ...Typography.bodySmallStrong },
  pressed: { opacity: 0.8 },
  options: { borderWidth: 1, borderRadius: Radius.control, overflow: 'hidden' },
  option: { minHeight: 48, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  lastOption: { borderBottomWidth: 0 },
  optionText: { ...Typography.bodySmall, flex: 1 },
  emptyOption: { ...Typography.caption, padding: Spacing.lg, fontStyle: 'italic' },
  footerButton: { flex: 1 },
});
