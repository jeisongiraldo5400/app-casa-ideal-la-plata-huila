import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  formatLastDownloadTime,
  requestManualDownload,
} from '@/lib/offline/sync/downloadData';

type DownloadDataButtonProps = {
  variant?: 'row' | 'cta';
};

export function DownloadDataButton({ variant = 'row' }: DownloadDataButtonProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const status = useSyncStore((state) => state.status);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const lastError = useSyncStore((state) => state.lastError);
  const [busy, setBusy] = useState(false);

  const syncing = busy || status === 'syncing';
  const time = formatLastDownloadTime(lastSyncedAt);
  const subtitle = syncing
    ? 'Sincronizando…'
    : lastError
      ? lastError
      : time
        ? `Datos actualizados · ${time}`
        : 'Negocios y cartera para usar sin red';

  const onPress = async () => {
    if (syncing) return;
    setBusy(true);
    try {
      const result = await requestManualDownload();
      if (!result.ok && result.reason === 'offline') {
        Alert.alert(
          'Sin conexión',
          'Conéctese a internet para descargar negocios y cartera.'
        );
        return;
      }
      if (!result.ok) {
        Alert.alert('No se pudo descargar', result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'cta') {
    return (
      <Pressable
        onPress={() => void onPress()}
        disabled={syncing}
        style={[styles.cta, { backgroundColor: colors.primary.main }]}
        testID="download-data-button"
      >
        {syncing ? (
          <ActivityIndicator color={colors.primary.contrastText} />
        ) : (
          <MaterialIcons name="cloud-download" size={20} color={colors.primary.contrastText} />
        )}
        <Text style={[styles.ctaText, { color: colors.primary.contrastText }]}>
          {syncing ? 'Sincronizando…' : 'Descargar información'}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={syncing}
      style={styles.row}
      testID="download-data-button"
    >
      <MaterialIcons name="cloud-download" size={20} color={colors.text.secondary} />
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Descargar información</Text>
        <Text
          style={[styles.value, { color: lastError ? colors.error.main : colors.text.primary }]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>
      {syncing ? (
        <ActivityIndicator color={colors.primary.main} />
      ) : (
        <MaterialIcons name="chevron-right" size={24} color={colors.text.secondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
  cta: {
    marginTop: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ctaText: {
    fontWeight: '700',
  },
});
