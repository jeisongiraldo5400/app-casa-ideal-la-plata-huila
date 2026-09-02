import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  const passwordRef = useRef<TextInput>(null);
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
    if (submitting) return;
    Keyboard.dismiss();
    setFormError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      const { error } = await signIn(email.trim(), password);
      if (error) {
        setFormError(error.message || 'Error al iniciar sesión');
        return;
      }
      router.replace('/(tabs)');
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
          <MaterialIcons name="error-outline" size={18} color={Colors.error.main} />
          <Text style={[styles.errorBannerText, { color: Colors.error.main }]}>
            {formError}
          </Text>
        </View>
      ) : null}

      <Input
        label="Correo electrónico"
        placeholder="tu@correo.com"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setEmailError(null);
          setFormError(null);
        }}
        error={emailError ?? undefined}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!submitting}
        autoFocus
        accessibilityLabel="Correo electrónico"
      />

      <Input
        ref={passwordRef}
        label="Contraseña"
        placeholder="••••••••"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setPasswordError(null);
          setFormError(null);
        }}
        error={passwordError ?? undefined}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        editable={!submitting}
        accessibilityLabel="Contraseña"
        rightElement={
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
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
    borderRadius: Radius.panel,
    borderWidth: 1,
    padding: Spacing.xxl,
    ...Shadows.card,
  },
  formHeader: {
    marginBottom: 20,
  },
  formTitle: {
    ...Typography.title,
    marginBottom: 6,
  },
  formSubtitle: {
    ...Typography.bodySmall,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    ...Typography.caption,
    flex: 1,
    fontWeight: '500',
  },
  button: {
    marginTop: 8,
  },
});
