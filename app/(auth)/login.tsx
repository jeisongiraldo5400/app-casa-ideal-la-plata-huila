import { LoginForm } from '@/components/auth/components/LoginForm';
import { useTheme } from '@/components/theme';
import { Spacing, getColors } from '@/constants/theme';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Keyboard,
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keyboardPadding =
    Platform.OS === 'ios' ? Spacing.xxl : keyboardHeight + Spacing.lg;

  const content = (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        {
          justifyContent: keyboardVisible ? 'flex-start' : 'center',
          paddingTop: keyboardVisible ? Math.max(insets.top, 8) : Math.max(insets.top, 16),
          paddingBottom: keyboardVisible
            ? keyboardPadding
            : Math.max(insets.bottom, 24),
        },
      ]}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      showsVerticalScrollIndicator={false}>
      <View style={[styles.brand, keyboardVisible && styles.brandCompact]}>
        <Text style={[styles.portalLabel, { color: Colors.primary.main }]}>
          PORTAL OPERATIVO
        </Text>
        <Image
          source={require('@/assets/images/logo_completo.png')}
          style={[styles.logoImage, keyboardVisible && styles.logoImageCompact]}
          resizeMode="contain"
          accessibilityLabel="Casa Ideal — Muebles y electrodomésticos"
        />
      </View>

      <LoginForm />

      {!keyboardVisible ? (
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: Colors.text.secondary }]}>
            Versión {Constants.expoConfig?.version || '1.0.0'}
          </Text>
          <Text style={[styles.footerText, { color: Colors.text.secondary }]}>
            © {new Date().getFullYear()} Casa Ideal
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );

  const screenStyle = [styles.container, { backgroundColor: Colors.background.default }];

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={screenStyle} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }

  return <View style={screenStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  brand: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    marginBottom: Spacing.lg,
  },
  brandCompact: {
    marginBottom: Spacing.sm,
  },
  portalLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: Spacing.md,
  },
  logoImage: {
    width: '100%',
    maxWidth: 240,
    height: 72,
  },
  logoImageCompact: {
    height: 48,
    maxWidth: 180,
  },
  footer: {
    marginTop: Spacing.xxl,
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
  },
});
