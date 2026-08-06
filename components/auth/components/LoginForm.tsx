import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { isDark } = useTheme();
  const Colors = getColors(isDark);

  const validate = () => {
    let ok = true;
    const trimmed = email.trim();

    if (!trimmed) {
      setEmailError('El correo electrónico es requerido');
      ok = false;
    } else if (!isValidEmail(trimmed)) {
      setEmailError('El correo electrónico no es válido');
      ok = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError('La contraseña es requerida');
      ok = false;
    } else if (password.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
      ok = false;
    } else {
      setPasswordError(null);
    }

    return ok;
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      const { error } = await signIn(email.trim(), password);
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
              backgroundColor: isDark
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(220, 38, 38, 0.08)',
              borderColor: Colors.error.main,
            },
          ]}>
          <Text style={[styles.errorBannerText, { color: Colors.error.main }]}>
            {formError}
          </Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: Colors.text.primary }]}>
          Correo electrónico
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: Colors.text.primary,
              borderColor: emailError ? Colors.error.main : Colors.divider,
              backgroundColor: Colors.background.paper,
            },
          ]}
          placeholder="tu@correo.com"
          placeholderTextColor={Colors.text.secondary}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setEmailError(null);
            setFormError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          editable={!submitting}
        />
        {emailError ? (
          <Text style={[styles.errorText, { color: Colors.error.main }]}>
            {emailError}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: Colors.text.primary }]}>
          Contraseña
        </Text>
        <View
          style={[
            styles.passwordRow,
            {
              borderColor: passwordError ? Colors.error.main : Colors.divider,
              backgroundColor: Colors.background.paper,
            },
          ]}>
          <TextInput
            style={[styles.passwordInput, { color: Colors.text.primary }]}
            placeholder="••••••••"
            placeholderTextColor={Colors.text.secondary}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError(null);
              setFormError(null);
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            editable={!submitting}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.eyeButton}>
            <MaterialIcons
              name={showPassword ? 'visibility' : 'visibility-off'}
              size={22}
              color={Colors.text.secondary}
            />
          </TouchableOpacity>
        </View>
        {passwordError ? (
          <Text style={[styles.errorText, { color: Colors.error.main }]}>
            {passwordError}
          </Text>
        ) : null}
      </View>

      <Button
        title="Iniciar sesión"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.button}
      />
    </View>
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
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    minHeight: 52,
  },
  passwordInput: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeButton: {
    paddingRight: 12,
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    marginTop: 6,
    fontWeight: '500',
  },
  button: {
    marginTop: 8,
  },
});
