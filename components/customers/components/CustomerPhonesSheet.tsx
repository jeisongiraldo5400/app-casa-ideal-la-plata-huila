import { Button, FullScreenModal, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import { useFormik } from 'formik';
import React, { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import * as Yup from 'yup';
import { customerPhoneSchema, customerPhoneSecondarySchema, toStoredPhone } from '../domain/customerPhones';
import type { CustomerPhonesInput } from '../infrastructure/services/customersDirectoryService';

const schema = Yup.object({
  phone: customerPhoneSchema,
  phoneSecondary: customerPhoneSecondarySchema,
});

interface CustomerPhonesSheetProps {
  visible: boolean;
  phone: string | null;
  phoneSecondary: string | null;
  onClose: () => void;
  /** Guarda en el servidor; si lanza, el error se muestra y la hoja sigue abierta. */
  onSave: (input: CustomerPhonesInput) => Promise<void>;
}

/** Editar el teléfono y el teléfono 2 (opcional) del cliente. Requiere señal. */
export function CustomerPhonesSheet({ visible, phone, phoneSecondary, onClose, onSave }: CustomerPhonesSheetProps) {
  const formik = useFormik({
    initialValues: { phone: phone ?? '', phoneSecondary: phoneSecondary ?? '' },
    validationSchema: schema,
    enableReinitialize: true,
    onSubmit: async (values) => {
      try {
        await onSave({ phone: toStoredPhone(values.phone), phoneSecondary: toStoredPhone(values.phoneSecondary) });
        onClose();
      } catch (error) {
        Alert.alert('No se pudo guardar', errorMessage(error, 'Inténtalo de nuevo'));
      }
    },
  });

  // Al abrir parte siempre de lo guardado, no de lo que quedó escrito antes.
  const { resetForm } = formik;
  useEffect(() => {
    if (visible) resetForm();
  }, [visible, resetForm]);

  const close = () => {
    if (formik.isSubmitting) return;
    onClose();
  };

  return (
    <FullScreenModal
      visible={visible}
      onClose={close}
      title="Teléfonos del cliente"
      subtitle="El teléfono 2 es opcional; déjalo vacío para quitarlo."
      dismissable={!formik.isSubmitting}
      footer={
        <View style={styles.footer}>
          <Button title="Cancelar" variant="outline" onPress={close} disabled={formik.isSubmitting} style={styles.footerButton} />
          <Button
            title="Guardar"
            onPress={() => formik.handleSubmit()}
            loading={formik.isSubmitting}
            style={styles.footerButton}
          />
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Input
          label="Teléfono"
          placeholder="Ej: 3001234567"
          keyboardType="phone-pad"
          value={formik.values.phone}
          onChangeText={formik.handleChange('phone')}
          onBlur={formik.handleBlur('phone')}
          error={formik.touched.phone ? formik.errors.phone : undefined}
        />
        <Input
          label="Teléfono 2 (opcional)"
          placeholder="Otro número de contacto"
          keyboardType="phone-pad"
          value={formik.values.phoneSecondary}
          onChangeText={formik.handleChange('phoneSecondary')}
          onBlur={formik.handleBlur('phoneSecondary')}
          error={formik.touched.phoneSecondary ? formik.errors.phoneSecondary : undefined}
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
