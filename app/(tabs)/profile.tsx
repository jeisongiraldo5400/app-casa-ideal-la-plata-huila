import { DownloadDataButton } from '@/components/offline';
import { ChangePasswordForm } from '@/components/auth/components/ChangePasswordForm';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useBluetoothPrinter } from '@/components/printing';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function ProfileScreen() {
  return (
    <ScreenErrorBoundary screen="Perfil">
      <ProfileScreenInner />
    </ScreenErrorBoundary>
  );
}

function ProfileScreenInner() {
  const { user, signOut } = useAuth();
  const { isDark, setThemeMode } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const { roles } = useUserRoles();
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const { savedPrinter, openPicker } = useBluetoothPrinter();
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const roleNames = roles
    .map((r) => r.role?.nombre)
    .filter(Boolean)
    .join(', ');

  const handleSignOut = async () => {
    Alert.alert(
      'Cerrar sesión',
      pendingCount
        ? `Hay ${pendingCount} cambio${pendingCount === 1 ? '' : 's'} sin sincronizar. Si cierras sesión se borrarán del dispositivo.`
        : '¿Estás seguro de que deseas cerrar sesión?',
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.default }]} edges={['top']}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { backgroundColor: colors.navigation.background }]}>
        <View style={[styles.avatarContainer, { backgroundColor: colors.primary.main }]}>
          <MaterialIcons name="person" size={42} color={colors.primary.contrastText} />
        </View>
        <Text style={styles.profileLabel}>MI PERFIL</Text>
        <Text style={styles.userName}>{user?.email?.split('@')[0] || 'Usuario'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        {!!roleNames && (
          <Text style={styles.roleText}>
            Rol: {roleNames}
          </Text>
        )}
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

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        <TouchableOpacity
          style={styles.changePasswordRow}
          onPress={() => setShowChangePasswordModal(true)}
          activeOpacity={0.7}
        >
          <MaterialIcons name="lock" size={20} color={colors.text.secondary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Contraseña</Text>
            <Text style={[styles.infoValue, { color: colors.primary.main }]}>Cambiar contraseña</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.text.secondary} />
        </TouchableOpacity>
      </Card>

      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Datos sin conexión</Text>
        <DownloadDataButton />
      </Card>

      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Impresora Bluetooth</Text>
        <TouchableOpacity
          style={styles.changePasswordRow}
          onPress={openPicker}
          activeOpacity={0.7}
        >
          <MaterialIcons name="print" size={20} color={colors.text.secondary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>PT-210</Text>
            <Text style={[styles.infoValue, { color: savedPrinter ? colors.text.primary : colors.primary.main }]}>
              {savedPrinter ? savedPrinter.name : 'Vincular impresora'}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.text.secondary} />
        </TouchableOpacity>
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
            <Text style={[styles.infoValue, { color: colors.text.primary }]}>
              {Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
        </View>
      </Card>

      <Button
        title="Cerrar sesión"
        onPress={handleSignOut}
        variant="outline"
        style={styles.signOutButton}
      />

      <ChangePasswordForm
        visible={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    padding: Spacing.xxl,
    borderRadius: Radius.panel,
    ...Shadows.floating,
  },
  avatarContainer: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  profileLabel: {
    color: '#bfdbfe',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  userName: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  userEmail: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  roleText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  card: {
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: Spacing.lg,
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
  changePasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  signOutButton: {
    marginTop: 8,
    marginBottom: 20,
  },
});
