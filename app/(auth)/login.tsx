import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoginForm } from '@/components/auth/components/LoginForm';
import { Colors } from '@/constants/theme';

export default function LoginScreen() {
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Header con logo y nombre */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.iconWrapper}>
                <MaterialIcons 
                  name="qr-code-scanner" 
                  size={56} 
                  color={Colors.primary.main} 
                />
              </View>
              <View style={styles.barcodeContainer}>
                <View style={styles.barcodeLines}>
                  <View style={[styles.barcodeLine, styles.barcodeLine1]} />
                  <View style={[styles.barcodeLine, styles.barcodeLine2]} />
                  <View style={[styles.barcodeLine, styles.barcodeLine3]} />
                  <View style={[styles.barcodeLine, styles.barcodeLine4]} />
                  <View style={[styles.barcodeLine, styles.barcodeLine5]} />
                </View>
              </View>
            </View>
            
            <Text style={styles.companyName}>Casa Ideal</Text>
            <Text style={styles.companyLocation}>La Plata Huila</Text>
            <Text style={styles.welcomeText}>Sistema de Gestión de Inventario</Text>
          </View>

          <LoginForm />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.default,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingTop: 60,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary.light + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary.main + '30',
    shadowColor: Colors.primary.main,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  barcodeContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  barcodeLines: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.background.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.divider,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  barcodeLine: {
    width: 3,
    backgroundColor: Colors.text.primary,
    borderRadius: 1.5,
  },
  barcodeLine1: {
    height: 24,
  },
  barcodeLine2: {
    height: 32,
  },
  barcodeLine3: {
    height: 28,
  },
  barcodeLine4: {
    height: 35,
  },
  barcodeLine5: {
    height: 26,
  },
  companyName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  companyLocation: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary.main,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  welcomeText: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
});

