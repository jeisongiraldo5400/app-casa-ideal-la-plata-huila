import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Formik, FormikHelpers } from 'formik';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Yup from 'yup';

interface LoginFormValues {
  email: string;
  password: string;
}

const loginSchema = Yup.object().shape({
  email: Yup.string()
    .email('El correo electrónico no es válido')
    .required('El correo electrónico es requerido'),
  password: Yup.string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .required('La contraseña es requerida'),
});

export function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { isDark } = useTheme();
  const Colors = getColors(isDark);

  const initialValues: LoginFormValues = {
    email: '',
    password: '',
  };

  const handleSubmit = async (
    values: LoginFormValues,
    { setSubmitting }: FormikHelpers<LoginFormValues>
  ) => {
    setFormError(null);
    try {
      const { error } = await signIn(values.email.trim(), values.password);
      if (error) {
        setFormError(error.message || 'Error al iniciar sesión');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      setFormError(error.message || 'Ocurrió un error inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={loginSchema}
      onSubmit={handleSubmit}>
      {({
        handleChange,
        handleBlur,
        handleSubmit,
        values,
        errors,
        touched,
        isSubmitting,
      }) => (
        <View
          style={[
            styles.form,
            {
              backgroundColor: Colors.background.paper,
              borderColor: Colors.divider,
            },
          ]}>
          <View style={styles.formHeader}>
            <Text style={[styles.formTitle, { color: Colors.text.primary }]}>
              Iniciar sesión
            </Text>
            <Text style={[styles.formSubtitle, { color: Colors.text.secondary }]}>
              Ingresa tus credenciales para continuar
            </Text>
          </View>

          {formError ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.08)',
                  borderColor: Colors.error.main,
                },
              ]}>
              <Text style={[styles.errorBannerText, { color: Colors.error.main }]}>
                {formError}
              </Text>
            </View>
          ) : null}

          <View style={styles.inputsContainer}>
            <Input
              label="Correo electrónico"
              placeholder="tu@correo.com"
              value={values.email}
              onChangeText={(text) => {
                setFormError(null);
                handleChange('email')(text);
              }}
              onBlur={handleBlur('email')}
              error={touched.email && errors.email ? errors.email : undefined}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <Input
              label="Contraseña"
              placeholder="••••••••"
              value={values.password}
              onChangeText={(text) => {
                setFormError(null);
                handleChange('password')(text);
              }}
              onBlur={handleBlur('password')}
              error={touched.password && errors.password ? errors.password : undefined}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                  accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={22}
                    color={Colors.text.secondary}
                  />
                </TouchableOpacity>
              }
            />
          </View>

          <Button
            title="Iniciar sesión"
            onPress={() => handleSubmit()}
            loading={isSubmitting}
            style={styles.button}
          />
        </View>
      )}
    </Formik>
  );
}

const styles = StyleSheet.create({
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  formHeader: {
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  formSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  inputsContainer: {
    marginBottom: 4,
  },
  button: {
    marginTop: 8,
  },
});
