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
          <View
            style={[
              styles.logoContainer,
              {
                backgroundColor: Colors.background.paper,
                borderColor: Colors.divider,
              },
            ]}>
            <Image
              source={require('@/assets/images/logo_completo.png')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="Casa Ideal — Muebles y electrodomésticos"
            />
          </View>
          <Text style={[styles.brandTagline, { color: Colors.text.secondary }]}>
            Portal operativo
          </Text>
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
    marginBottom: 24,
  },
  logoContainer: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 300,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  logoImage: {
    width: '100%',
    height: 76,
  },
  brandTagline: {
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
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
