import { useTheme } from '@/components/theme';
import { ActionBar, Button, FullScreenModal } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import {
  DEFAULT_MIS_COBROS_FILTERS,
  misCobrosRangeError,
  type MisCobrosCierre,
  type MisCobrosFilters,
  type MisCobrosSite,
  type MisCobrosStatus,
} from '@/lib/cartera/misCobros';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Option<T extends string> = { value: T; label: string };

const STATUS_OPTIONS: Option<MisCobrosStatus>[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'vigentes', label: 'Vigentes' },
  { value: 'anulados', label: 'Anulados' },
];

const SITE_OPTIONS: Option<MisCobrosSite>[] = [
  { value: '', label: 'Todos' },
  { value: 'app_movil', label: 'Aplicación Móvil' },
  { value: 'almacen', label: 'Almacén' },
  { value: 'sin_registro', label: 'No registrado' },
];

const CIERRE_OPTIONS: Option<MisCobrosCierre>[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'no', label: 'Sin cierre' },
  { value: 'si', label: 'En un cierre' },
];

type Props = {
  visible: boolean;
  values: MisCobrosFilters;
  paymentMethods: { id: string; name: string }[];
  /** Sin señal el teléfono no sabe qué entró a un cierre. */
  offline: boolean;
  onChange: (next: MisCobrosFilters) => void;
  onApply: () => void;
  onClose: () => void;
};

export function MisCobrosFilterSheet({ visible, values, paymentMethods, offline, onChange, onApply, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const patch = (next: Partial<MisCobrosFilters>) => onChange({ ...values, ...next });
  const rangeError = misCobrosRangeError(values);

  const chip = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="checkbox"
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

  const toggleMethod = (id: string) => {
    const current = values.paymentMethodIds;
    patch({ paymentMethodIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] });
  };

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Filtrar mis cobros"
      footer={
        <ActionBar>
          <View style={styles.footer}>
            <Button title="Limpiar" variant="outline" onPress={() => onChange({ ...DEFAULT_MIS_COBROS_FILTERS, search: values.search })} style={styles.footerButton} />
            <Button title="Aplicar" onPress={onApply} disabled={Boolean(rangeError)} style={styles.footerButton} />
          </View>
        </ActionBar>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Método de pago</Text>
          <Text style={[styles.hint, { color: colors.text.secondary }]}>Puedes elegir varios. Sin ninguno se muestran todos.</Text>
          <View style={styles.chips}>
            {paymentMethods.length
              ? paymentMethods.map((method) =>
                  chip(method.id, method.name, values.paymentMethodIds.includes(method.id), () => toggleMethod(method.id))
                )
              : <Text style={[styles.hint, { color: colors.text.secondary }]}>No hay métodos de pago descargados.</Text>}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Sitio de pago</Text>
          <View style={styles.chips}>
            {SITE_OPTIONS.map((option) => chip(`site-${option.value}`, option.label, values.site === option.value, () => patch({ site: option.value })))}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Estado</Text>
          <View style={styles.chips}>
            {STATUS_OPTIONS.map((option) => chip(`status-${option.value}`, option.label, values.status === option.value, () => patch({ status: option.value })))}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Cierre de recaudo</Text>
          <View style={styles.chips}>
            {CIERRE_OPTIONS.map((option) => chip(`cierre-${option.value}`, option.label, values.inCierre === option.value, () => patch({ inCierre: option.value })))}
          </View>
          {offline ? (
            <Text style={[styles.hint, { color: colors.warning.main }]}>Sin señal no se sabe qué pagos entraron a un cierre: este filtro se aplica al volver la conexión.</Text>
          ) : null}
        </View>
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.xxl, paddingBottom: Spacing.xxxl },
  group: { gap: Spacing.md },
  label: { ...Typography.label },
  hint: { ...Typography.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: Radius.chip },
  chipText: { ...Typography.bodySmallStrong },
  dates: { flexDirection: 'row', gap: Spacing.md },
  date: { flex: 1, gap: Spacing.xs },
  clear: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  clearText: { ...Typography.bodySmallStrong },
  footer: { flexDirection: 'row', gap: Spacing.md },
  footerButton: { flex: 1 },
  pressed: { opacity: 0.8 },
});
