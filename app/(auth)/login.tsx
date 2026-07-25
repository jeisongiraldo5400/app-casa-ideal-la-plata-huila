import { LoginForm } from '@/components/auth/components/LoginForm';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import Constants from 'expo-constants';
import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: Colors.background.default }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandPanel}>
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/logo_completo.png')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="Casa Ideal — Muebles y electrodomésticos"
            />
          </View>
          <Text style={styles.brandTagline}>Acceso al sistema de inventario</Text>
        </View>

        <LoginForm />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: Colors.text.secondary }]}>
            Versión {Constants.expoConfig?.version || '1.0.0'}
          </Text>
          <Text style={[styles.footerText, { color: Colors.text.secondary }]}>
            © {new Date().getFullYear()} Casa Ideal
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  brandPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#0b1f4a',
  },
  logoContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: 48,
  },
  brandTagline: {
    marginTop: 14,
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
  footer: {
    marginTop: 28,
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
  },
});
