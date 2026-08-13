import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { getSecureJson, SECURE_KEYS, setSecureJson } from '@/lib/offline/security/secureKeys';

export function AppLockGate() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const locked = useSyncStore((state) => state.locked);
  const setLocked = useSyncStore((state) => state.setLocked);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Desbloquea para ver cartera y clientes');

  const unlock = useCallback(async () => {
    setBusy(true);
    try {
      const enabled = await getSecureJson<boolean>(SECURE_KEYS.appLockEnabled);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (enabled === false || !hasHardware || !enrolled) {
        setLocked(false);
        return;
      }
      if (enabled == null) {
        await setSecureJson(SECURE_KEYS.appLockEnabled, true);
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear Casa Ideal',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
      else setMessage('No se pudo desbloquear. Inténtalo de nuevo.');
    } catch {
      setMessage('La autenticación biométrica no está disponible.');
      setLocked(false);
    } finally {
      setBusy(false);
    }
  }, [setLocked]);

  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  if (!locked) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background.default }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>App bloqueada</Text>
      <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{message}</Text>
      {busy ? (
        <ActivityIndicator color={colors.primary.main} />
      ) : (
        <Pressable onPress={() => void unlock()} style={[styles.button, { backgroundColor: colors.primary.main }]}>
          <Text style={styles.buttonText}>Desbloquear</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { textAlign: 'center', marginBottom: 8 },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
