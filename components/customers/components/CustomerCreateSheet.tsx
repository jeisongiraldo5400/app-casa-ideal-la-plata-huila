import { useTheme } from '@/components/theme';
import { Button, FullScreenModal, Input, OptionPickerField } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import {
  EMPTY_LOCATION_MASTERS,
  fetchLocationMasters,
  type LocationMasters,
} from '@/lib/locations/locationsService';
import { useFormik } from 'formik';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import * as Yup from 'yup';
import { createCustomer } from '../infrastructure/services/customersService';

const schema = Yup.object({
  name: Yup.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').required('El nombre es requerido'),
  idNumber: Yup.string().trim().min(3, 'El documento debe tener al menos 3 caracteres').required('El documento es requerido'),
  phone: Yup.string().trim().max(50, 'El teléfono no puede exceder 50 caracteres'),
  address: Yup.string().trim().max(500, 'La dirección no puede exceder 500 caracteres'),
  departamentoId: Yup.string(),
  municipioId: Yup.string(),
  veredaId: Yup.string(),
});

interface CustomerCreateSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Alta de cliente desde el módulo. No envía `seller_id`: el trigger
 * `enforce_customer_seller` asigna al vendedor que crea, también cuando el
 * alta se sincroniza desde la cola sin conexión.
 */
export function CustomerCreateSheet({ visible, onClose, onCreated }: CustomerCreateSheetProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [masters, setMasters] = useState<LocationMasters>(EMPTY_LOCATION_MASTERS);

  useEffect(() => {
    if (!visible) return;
    fetchLocationMasters()
      .then(setMasters)
      .catch(() => setMasters(EMPTY_LOCATION_MASTERS));
  }, [visible]);

  const formik = useFormik({
    initialValues: { name: '', idNumber: '', phone: '', address: '', departamentoId: '', municipioId: '', veredaId: '' },
    validationSchema: schema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const created = await createCustomer({
          name: values.name.trim(),
          idNumber: values.idNumber.trim(),
          phone: values.phone.trim() || null,
          address: values.address.trim() || null,
          municipioId: values.municipioId || null,
          veredaId: values.veredaId || null,
        });
        resetForm();
        onCreated();
        Alert.alert('Cliente creado', `${created.name} quedó registrado y asignado a ti.`);
      } catch (error) {
        Alert.alert('Error', errorMessage(error, 'No se pudo crear el cliente'));
      }
    },
  });

  const municipios = useMemo(
    () =>
      masters.municipios
        .filter((m) => !formik.values.departamentoId || m.departamento_id === formik.values.departamentoId)
        .map((m) => ({ value: m.id, label: m.nombre })),
    [masters.municipios, formik.values.departamentoId]
  );
  const veredas = useMemo(
    () =>
      masters.veredas
        .filter((v) => v.municipio_id === formik.values.municipioId)
        .map((v) => ({ value: v.id, label: v.nombre })),
    [masters.veredas, formik.values.municipioId]
  );

  const close = () => {
    if (formik.isSubmitting) return;
    formik.resetForm();
    onClose();
  };

  return (
    <FullScreenModal
      visible={visible}
      onClose={close}
      title="Nuevo cliente"
      subtitle="Quedará asignado a ti"
      dismissable={!formik.isSubmitting}
      footer={
        <View style={styles.footer}>
          <Button title="Cancelar" variant="outline" onPress={close} disabled={formik.isSubmitting} style={styles.footerButton} />
          <Button
            title="Crear cliente"
            onPress={() => formik.handleSubmit()}
            loading={formik.isSubmitting}
            style={styles.footerButton}
          />
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Input
          label="Nombre completo"
          placeholder="Ej: Juan Pérez"
          value={formik.values.name}
          onChangeText={formik.handleChange('name')}
          onBlur={formik.handleBlur('name')}
          error={formik.touched.name ? formik.errors.name : undefined}
        />
        <Input
          label="Documento"
          placeholder="Ej: 1080123456"
          keyboardType="number-pad"
          value={formik.values.idNumber}
          onChangeText={formik.handleChange('idNumber')}
          onBlur={formik.handleBlur('idNumber')}
          error={formik.touched.idNumber ? formik.errors.idNumber : undefined}
        />
        <Input
          label="Teléfono"
          placeholder="Ej: 3001234567"
          keyboardType="phone-pad"
          value={formik.values.phone}
          onChangeText={formik.handleChange('phone')}
          onBlur={formik.handleBlur('phone')}
          error={formik.touched.phone ? formik.errors.phone : undefined}
        />
        <OptionPickerField
          value={formik.values.departamentoId}
          onValueChange={(value) => {
            void formik.setFieldValue('departamentoId', value);
            void formik.setFieldValue('municipioId', '');
            void formik.setFieldValue('veredaId', '');
          }}
          options={masters.departamentos.map((d) => ({ value: d.id, label: d.nombre }))}
          placeholder="Departamento (opcional)"
          modalTitle="Departamento"
          colors={colors}
        />
        <OptionPickerField
          value={formik.values.municipioId}
          onValueChange={(value) => {
            void formik.setFieldValue('municipioId', value);
            void formik.setFieldValue('veredaId', '');
          }}
          options={municipios}
          placeholder="Municipio (opcional)"
          modalTitle="Municipio"
          colors={colors}
        />
        <OptionPickerField
          value={formik.values.veredaId}
          onValueChange={(value) => void formik.setFieldValue('veredaId', value)}
          options={veredas}
          placeholder="Vereda (opcional)"
          modalTitle="Vereda"
          colors={colors}
          disabled={!formik.values.municipioId}
        />
        <Input
          label="Dirección"
          placeholder="Ej: Calle 8 # 10-15"
          value={formik.values.address}
          onChangeText={formik.handleChange('address')}
          onBlur={formik.handleBlur('address')}
          error={formik.touched.address ? formik.errors.address : undefined}
        />
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.xxxl },
  footer: { flexDirection: 'row', gap: Spacing.sm },
  footerButton: { flex: 1 },
});
