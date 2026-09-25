import { useTheme } from '@/components/theme';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Acceso a «Mis cobros» desde Cartera, para quien registra cobros: admin,
 * gestor de cobro y recaudador (los mismos de `localPagoPermission`).
 */
export function MisCobrosEntryButton() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, isGestorCobro, isRecaudador } = useUserRoles();
  if (!isAdmin() && !isGestorCobro() && !isRecaudador()) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mis cobros"
      accessibilityHint="Pagos que registraste, con filtros por fecha, método y cierre"
      onPress={() => router.push('/mis-cobros')}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.background.paper, borderColor: colors.divider }, pressed && styles.pressed]}>
      <View style={[styles.icon, { backgroundColor: `${colors.primary.main}16` }]}>
        <MaterialIcons name="receipt-long" size={IconSize.sm} color={colors.primary.main} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Mis cobros</Text>
        <Text style={[styles.hint, { color: colors.text.secondary }]} numberOfLines={1}>Lo que cobré, por fecha, método y cierre</Text>
      </View>
      <MaterialIcons name="chevron-right" size={IconSize.md} color={colors.text.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 56, borderWidth: 1, borderRadius: Radius.control, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  icon: { width: 32, height: 32, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { ...Typography.bodyStrong },
  hint: { ...Typography.metadata },
  pressed: { opacity: 0.8 },
});
