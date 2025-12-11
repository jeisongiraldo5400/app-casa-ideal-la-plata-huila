import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { Formik, FormikHelpers } from 'formik';
import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Yup from 'yup';

interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const changePasswordSchema = Yup.object().shape({
  currentPassword: Yup.string()
    .required('La contraseña actual es requerida'),
  newPassword: Yup.string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .required('La nueva contraseña es requerida'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], 'Las contraseñas no coinciden')
    .required('Confirma tu nueva contraseña'),
});

interface ChangePasswordFormProps {
  visible: boolean;
  onClose: () => void;
}

export function ChangePasswordForm({ visible, onClose }: ChangePasswordFormProps) {
  const { changePassword, user } = useAuth();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const initialValues: ChangePasswordFormValues = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

  const handleSubmit = async (
    values: ChangePasswordFormValues,
    { setSubmitting, resetForm }: FormikHelpers<ChangePasswordFormValues>
  ) => {
    try {
      // Verificar que la contraseña actual sea correcta
      if (!user?.email) {
        Alert.alert('Error', 'No se pudo obtener la información del usuario');
        setSubmitting(false);
        return;
      }

      // Verificar contraseña actual usando supabase directamente para no afectar la sesión
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: values.currentPassword,
      });

      if (signInError) {
        Alert.alert('Error', 'La contraseña actual es incorrecta');
        setSubmitting(false);
        return;
      }

      // Cambiar la contraseña
      const { error } = await changePassword(values.newPassword);
      if (error) {
        Alert.alert('Error', error.message || 'Error al cambiar la contraseña');
      } else {
        Alert.alert(
          'Éxito',
          'Tu contraseña ha sido cambiada exitosamente',
          [
            {
              text: 'OK',
              onPress: () => {
                resetForm();
                onClose();
              },
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Ocurrió un error inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={24} color={Colors.text.primary} />
            </TouchableOpacity>
          </View>

          <Formik
            initialValues={initialValues}
            validationSchema={changePasswordSchema}
            onSubmit={handleSubmit}
          >
            {({
              handleChange,
              handleBlur,
              handleSubmit,
              values,
              errors,
              touched,
              isSubmitting,
            }) => (
              <View>
                <View style={styles.inputsContainer}>
                  <View style={styles.passwordContainer}>
                    <Input
                      label="Contraseña actual"
                      placeholder="••••••••"
                      value={values.currentPassword}
                      onChangeText={handleChange('currentPassword')}
                      onBlur={handleBlur('currentPassword')}
                      error={touched.currentPassword && errors.currentPassword ? errors.currentPassword : undefined}
                      secureTextEntry={!showCurrentPassword}
                      autoCapitalize="none"
                      autoComplete="password"
                      style={styles.passwordInput}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={showCurrentPassword ? 'visibility' : 'visibility-off'}
                        size={24}
                        color={Colors.text.secondary}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.passwordContainer}>
                    <Input
                      label="Nueva contraseña"
                      placeholder="••••••••"
                      value={values.newPassword}
                      onChangeText={handleChange('newPassword')}
                      onBlur={handleBlur('newPassword')}
                      error={touched.newPassword && errors.newPassword ? errors.newPassword : undefined}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      autoComplete="password-new"
                      style={styles.passwordInput}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={showNewPassword ? 'visibility' : 'visibility-off'}
                        size={24}
                        color={Colors.text.secondary}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.passwordContainer}>
                    <Input
                      label="Confirmar nueva contraseña"
                      placeholder="••••••••"
                      value={values.confirmPassword}
                      onChangeText={handleChange('confirmPassword')}
                      onBlur={handleBlur('confirmPassword')}
                      error={touched.confirmPassword && errors.confirmPassword ? errors.confirmPassword : undefined}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoComplete="password-new"
                      style={styles.passwordInput}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                        size={24}
                        color={Colors.text.secondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.buttonsContainer}>
                  <Button
                    title="Cancelar"
                    onPress={onClose}
                    variant="outline"
                    style={styles.cancelButton}
                  />
                  <Button
                    title="Cambiar contraseña"
                    onPress={() => handleSubmit()}
                    loading={isSubmitting}
                    style={styles.submitButton}
                  />
                </View>
              </View>
            )}
          </Formik>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  inputsContainer: {
    marginBottom: 24,
  },
  passwordContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 38,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
  },
  submitButton: {
    flex: 1,
  },
});
