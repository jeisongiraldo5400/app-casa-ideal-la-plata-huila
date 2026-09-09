import { useTheme } from '@/components/theme';
import { Button, FullScreenModal, OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { LocationMasters } from '@/lib/locations/locationsService';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  EMPTY_DELIVERY_LOCATION_FILTER,
  type DeliveryLocationFilter,
} from '../domain/deliveryLocation';

type Props = {
  visible: boolean;
  masters: LocationMasters;
  mastersLoading?: boolean;
  value: DeliveryLocationFilter;
  onChange: (next: DeliveryLocationFilter) => void;
  onClose: () => void;
};

/** Filtro de ubicación de las órdenes de entrega: departamento → municipio →
 *  vereda, encadenados igual que en el web. Elegir un nivel superior descarta
 *  los inferiores, así el filtro nunca queda en un estado imposible (municipio
 *  de otro departamento). */
export function DeliveryOrderLocationFilterModal({
  visible,
  masters,
  mastersLoading = false,
  value,
  onChange,
  onClose,
}: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const departamentoOptions = useMemo(
    () => masters.departamentos.map((item) => ({ value: item.id, label: item.nombre })),
    [masters.departamentos],
  );

  const municipioOptions = useMemo(
    () =>
      masters.municipios
        .filter((item) => item.departamento_id === value.departamentoId)
        .map((item) => ({ value: item.id, label: item.nombre })),
    [masters.municipios, value.departamentoId],
  );

  const veredaOptions = useMemo(
    () =>
      masters.veredas
        .filter((item) => item.municipio_id === value.municipioId)
        .map((item) => ({ value: item.id, label: item.nombre })),
    [masters.veredas, value.municipioId],
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
            onPress={() => onChange(EMPTY_DELIVERY_LOCATION_FILTER)}
            style={styles.footerButton}
          />
          <Button title="Aplicar filtros" onPress={onClose} style={styles.footerButton} />
        </>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.text.secondary }]}>
          {mastersLoading
            ? 'Cargando los municipios…'
            : 'Sólo las órdenes de cliente llevan ubicación; las remisiones se localizan por zona.'}
        </Text>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Departamento</Text>
          <OptionPickerField
            value={value.departamentoId}
            onValueChange={(departamentoId) =>
              // Cambiar de departamento invalida municipio y vereda.
              onChange({ departamentoId, municipioId: '', veredaId: '' })
            }
            options={departamentoOptions}
            placeholder="Todos los departamentos"
            modalTitle="Departamento"
            colors={colors}
            disabled={mastersLoading}
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Municipio</Text>
          <OptionPickerField
            value={value.municipioId}
            onValueChange={(municipioId) => onChange({ ...value, municipioId, veredaId: '' })}
            options={municipioOptions}
            placeholder={
              value.departamentoId ? 'Todos los municipios' : 'Elija primero un departamento'
            }
            modalTitle="Municipio"
            colors={colors}
            disabled={mastersLoading || !value.departamentoId}
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
            disabled={mastersLoading || !value.municipioId || veredaOptions.length === 0}
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
