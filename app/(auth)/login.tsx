import { LoginForm } from '@/components/auth/components/LoginForm';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

export default function LoginScreen() {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const brandTranslate = useRef(new Animated.Value(16)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslate = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(brandTranslate, {
          toValue: 0,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslate, {
          toValue: 0,
          duration: 480,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [brandOpacity, brandTranslate, formOpacity, formTranslate]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: Colors.background.default }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.brandPanel,
            {
              opacity: brandOpacity,
              transform: [{ translateY: brandTranslate }],
            },
          ]}>
          <View style={styles.brandGlow} />
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/logo_completo.png')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="Casa Ideal — Muebles y electrodomésticos"
            />
          </View>
          <Text style={styles.brandTagline}>Acceso al sistema de inventario</Text>
        </Animated.View>

        <Animated.View
          style={{
            opacity: formOpacity,
            transform: [{ translateY: formTranslate }],
          }}>
          <LoginForm />
        </Animated.View>

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
    overflow: 'hidden',
    backgroundColor: '#0b1f4a',
  },
  brandGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    top: -40,
    alignSelf: 'center',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
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
