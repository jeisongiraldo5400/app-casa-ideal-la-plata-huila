import { OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { LocationMasters } from '@/lib/locations/locationsService';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Ubicación elegida en un filtro. '' en cualquier nivel = sin filtrar. */
export type LocationCascadeValue = {
  departamentoId: string;
  municipioId: string;
  veredaId: string;
};

type Props = {
  masters: LocationMasters;
  mastersLoading?: boolean;
  value: LocationCascadeValue;
  onChange: (next: LocationCascadeValue) => void;
  colors: ReturnType<typeof getColors>;
};

/**
 * Departamento → municipio → vereda encadenados, igual que en el web. Elegir
 * un nivel superior descarta los inferiores, así el filtro nunca queda en un
 * estado imposible (municipio de otro departamento). Lo usan el filtro de
 * órdenes de entrega y el de negocios.
 */
export function LocationCascadeFields({ masters, mastersLoading = false, value, onChange, colors }: Props) {
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
    <>
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
          placeholder={value.departamentoId ? 'Todos los municipios' : 'Elija primero un departamento'}
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
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  label: { ...Typography.label },
});
