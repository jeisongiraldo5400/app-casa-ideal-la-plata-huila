import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Formik, FormikHelpers } from 'formik';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');

  const initialValues: LoginFormValues = {
    email: '',
    password: '',
  };

  const handleSubmit = async (
    values: LoginFormValues,
    { setSubmitting }: FormikHelpers<LoginFormValues>
  ) => {
    try {
      const { error } = await signIn(values.email.trim(), values.password);
      if (error) {
        Alert.alert('Error', error.message || 'Error al iniciar sesión');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Ocurrió un error inesperado');
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
        <Card style={styles.card}>
          <View style={styles.formHeader}>
            <Text style={[styles.formTitle, { color: Colors.text.primary }]}>Iniciar Sesión</Text>
            <Text style={[styles.formSubtitle, { 
              color: colorScheme === 'dark' ? Colors.text.primary : Colors.text.secondary,
              opacity: colorScheme === 'dark' ? 0.9 : 1
            }]}>
              Ingresa tus credenciales para acceder
            </Text>
          </View>

          <View style={styles.inputsContainer}>
            <Input
              label="Correo electrónico"
              placeholder="tu@correo.com"
              value={values.email}
              onChangeText={handleChange('email')}
              onBlur={handleBlur('email')}
              error={touched.email && errors.email ? errors.email : undefined}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <View style={styles.passwordContainer}>
              <Input
                label="Contraseña"
                placeholder="••••••••"
                value={values.password}
                onChangeText={handleChange('password')}
                onBlur={handleBlur('password')}
                error={touched.password && errors.password ? errors.password : undefined}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                style={styles.passwordInput}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility' : 'visibility-off'}
                  size={24}
                  color={Colors.text.secondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <Button
            title="Iniciar sesión"
            onPress={() => handleSubmit()}
            loading={isSubmitting}
            style={styles.button}
          />

          <View style={[styles.versionContainer, { borderTopColor: Colors.divider }]}>
            <Text style={[styles.versionText, { 
              color: colorScheme === 'dark' ? Colors.text.primary : Colors.text.secondary,
              opacity: colorScheme === 'dark' ? 0.8 : 1
            }]}>
              Versión {Constants.expoConfig?.version || '1.0.0'}
            </Text>
            <Text style={[styles.yearText, { 
              color: colorScheme === 'dark' ? Colors.text.primary : Colors.text.secondary,
              opacity: colorScheme === 'dark' ? 0.8 : 1
            }]}>
              © {new Date().getFullYear()}
            </Text>
          </View>
        </Card>
      )}
    </Formik>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  formHeader: {
    marginBottom: 24,
    alignItems: 'center',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  inputsContainer: {
    marginBottom: 8,
  },
  passwordContainer: {
    position: 'relative',
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
  button: {
    marginTop: 16,
  },
  versionContainer: {
    marginTop: 24,
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  versionText: {
    fontSize: 12,
    marginBottom: 4,
  },
  yearText: {
    fontSize: 12,
  },
});

