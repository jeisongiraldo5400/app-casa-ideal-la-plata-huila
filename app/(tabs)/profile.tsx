import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Switch, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { themeMode, isDark, setThemeMode } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();

  const handleSignOut = async () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que deseas cerrar sesión?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background.default }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <MaterialIcons name="account-circle" size={80} color={colors.primary.main} />
        </View>
        <Text style={[styles.userName, { color: colors.text.primary }]}>{user?.email?.split('@')[0] || 'Usuario'}</Text>
        <Text style={[styles.userEmail, { color: colors.text.secondary }]}>{user?.email}</Text>
      </View>

      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Información de la cuenta</Text>
        
        <View style={styles.infoRow}>
          <MaterialIcons name="email" size={20} color={colors.text.secondary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Correo electrónico</Text>
            <Text style={[styles.infoValue, { color: colors.text.primary }]}>{user?.email}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        <View style={styles.infoRow}>
          <MaterialIcons name="fingerprint" size={20} color={colors.text.secondary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>ID de usuario</Text>
            <Text style={[styles.infoValue, { color: colors.text.primary }]} numberOfLines={1} ellipsizeMode="middle">
              {user?.id}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Apariencia</Text>
        
        <TouchableOpacity
          style={styles.themeRow}
          onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
          activeOpacity={0.7}
        >
          <View style={styles.themeRowLeft}>
            <MaterialIcons 
              name={isDark ? 'dark-mode' : 'light-mode'} 
              size={20} 
              color={colors.text.secondary} 
            />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Modo oscuro</Text>
              <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                {isDark ? 'Activado' : 'Desactivado'}
              </Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={(value) => setThemeMode(value ? 'dark' : 'light')}
            trackColor={{ false: colors.divider, true: colors.primary.light }}
            thumbColor={isDark ? colors.primary.main : colors.text.secondary}
          />
        </TouchableOpacity>
      </Card>

      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Sistema</Text>
        
        <View style={styles.infoRow}>
          <MaterialIcons name="info" size={20} color={colors.text.secondary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Versión de la aplicación</Text>
            <Text style={[styles.infoValue, { color: colors.text.primary }]}>1.0.0</Text>
          </View>
        </View>
      </Card>

      <Button
        title="Cerrar sesión"
        onPress={handleSignOut}
        variant="outline"
        style={styles.signOutButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  userEmail: {
    fontSize: 16,
  },
  card: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  themeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 16,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  signOutButton: {
    marginTop: 8,
    marginBottom: 20,
  },
});

