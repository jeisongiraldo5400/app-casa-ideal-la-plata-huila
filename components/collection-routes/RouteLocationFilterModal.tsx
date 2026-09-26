import { useTheme } from '@/components/theme';
import { Button, FullScreenModal, OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { LocationNames } from '@/lib/collection-routes/candidates';
import { EMPTY_ROUTE_LOCATION_FILTER, type RouteLocationFilter } from '@/lib/collection-routes/types';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  masters: LocationNames;
  loading?: boolean;
  value: RouteLocationFilter;
  onChange: (next: RouteLocationFilter) => void;
  onClose: () => void;
};

/**
 * Departamento → municipio → vereda para armar la ruta, encadenados como en el
 * resto de la app: elegir un nivel superior descarta los inferiores.
 */
export function RouteLocationFilterModal({ visible, masters, loading = false, value, onChange, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const departamentoOptions = useMemo(
    () => masters.departamentos.map((item) => ({ value: item.id, label: item.nombre })),
    [masters.departamentos]
  );
  // Sin departamento elegido se puede ir directo al municipio.
  const municipioOptions = useMemo(
    () =>
      masters.municipios
        .filter((item) => !value.departamentoId || item.departamento_id === value.departamentoId)
        .map((item) => ({ value: item.id, label: item.nombre })),
    [masters.municipios, value.departamentoId]
  );
  const veredaOptions = useMemo(
    () =>
      masters.veredas
        .filter((item) => item.municipio_id === value.municipioId)
        .map((item) => ({ value: item.id, label: item.nombre })),
    [masters.veredas, value.municipioId]
  );

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Filtrar por ubicación"
      footer={
        <>
          <Button
            title="Limpiar"
            variant="outline"
            onPress={() => onChange(EMPTY_ROUTE_LOCATION_FILTER)}
            style={styles.footerButton}
          />
          <Button title="Aplicar" onPress={onClose} style={styles.footerButton} />
        </>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.text.secondary }]}>
          {loading
            ? 'Cargando municipios y veredas…'
            : 'Se usa la ubicación del negocio y, si no la tiene, la del cliente.'}
        </Text>
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Departamento</Text>
          <OptionPickerField
            value={value.departamentoId}
            onValueChange={(departamentoId) => onChange({ departamentoId, municipioId: '', veredaId: '' })}
            options={departamentoOptions}
            placeholder="Todos los departamentos"
            modalTitle="Departamento"
            colors={colors}
            disabled={loading}
          />
        </View>
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Municipio</Text>
          <OptionPickerField
            value={value.municipioId}
            onValueChange={(municipioId) => {
              const municipio = masters.municipios.find((item) => item.id === municipioId);
              onChange({
                departamentoId: value.departamentoId || municipio?.departamento_id || '',
                municipioId,
                veredaId: '',
              });
            }}
            options={municipioOptions}
            placeholder="Todos los municipios"
            modalTitle="Municipio"
            colors={colors}
            disabled={loading}
          />
        </View>
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Vereda</Text>
          <OptionPickerField
            value={value.veredaId}
            onValueChange={(veredaId) => onChange({ ...value, veredaId })}
            options={veredaOptions}
            placeholder={
              !value.municipioId
                ? 'Elija primero un municipio'
                : veredaOptions.length === 0
                  ? 'El municipio no tiene veredas cargadas'
                  : 'Todas las veredas'
            }
            modalTitle="Vereda"
            colors={colors}
            disabled={loading || !value.municipioId || veredaOptions.length === 0}
          />
        </View>
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.xl, paddingBottom: Spacing.xxl },
  hint: { ...Typography.caption },
  group: { gap: Spacing.sm },
  label: { ...Typography.label },
  footerButton: { flex: 1 },
});
