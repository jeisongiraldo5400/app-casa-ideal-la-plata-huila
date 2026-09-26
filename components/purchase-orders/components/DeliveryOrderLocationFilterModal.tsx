import { LocationCascadeFields } from '@/components/locations/LocationCascadeFields';
import { useTheme } from '@/components/theme';
import { Button, FullScreenModal } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { LocationMasters } from '@/lib/locations/locationsService';
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
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
 *  vereda, encadenados igual que en el web (ver `LocationCascadeFields`). */
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

        <LocationCascadeFields
          masters={masters}
          mastersLoading={mastersLoading}
          value={value}
          onChange={onChange}
          colors={colors}
        />
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.xl, paddingBottom: Spacing.xxl },
  hint: { ...Typography.caption },
  footerButton: { flex: 1 },
});
