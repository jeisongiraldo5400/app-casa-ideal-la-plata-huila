import { useTheme } from '@/components/theme';
import { SectionHeader } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { logHandledError } from '@/lib/errorMessage';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getTransferPhotoSignedUrl } from '../infrastructure/services/transferPhotosService';
import type { TransferEvent } from '../utils/transferModel';
import { eventPhotos, type TransferEventPhoto } from '../utils/transferPhotos';

/** URLs firmadas (1 h) de las rutas; una que falle se omite sin tumbar la vista. */
function useSignedUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    if (!paths.length) return;
    let active = true;
    void Promise.all(
      paths.map(async (path) => {
        try {
          return [path, await getTransferPhotoSignedUrl(path)] as const;
        } catch (error) {
          logHandledError('Traslados: abrir foto', error);
          return null;
        }
      })
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, string> = {};
      for (const entry of entries) if (entry) next[entry[0]] = entry[1];
      setUrls(next);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Fotos de la salida / recepción (una por archivo) con toque para ampliar. */
export function TransferPhotosView({ events }: { events: TransferEvent[] }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const photos = useMemo(() => eventPhotos(events), [events]);
  const urls = useSignedUrls(photos.map((photo) => photo.path));
  const [open, setOpen] = useState<TransferEventPhoto | null>(null);

  if (!photos.length) return null;
  const openUrl = open ? urls[open.path] : undefined;

  return (
    <View style={styles.container}>
      <SectionHeader title="Fotos" hint={`${photos.length}`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {photos.map((photo) => {
          const url = urls[photo.path];
          return (
            <Pressable
              key={photo.path}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Ampliar foto: ${photo.label}`}
              onPress={() => setOpen(photo)}
              disabled={!url}
              style={styles.tile}
            >
              {url ? (
                <Image source={{ uri: url }} style={[styles.thumb, { backgroundColor: colors.background.paper }]} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.background.paper }]} />
              )}
              <Text numberOfLines={2} style={[styles.caption, { color: colors.text.secondary }]}>
                {photo.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(null)}
          accessibilityRole="button"
          accessibilityLabel="Cerrar foto"
        >
          {openUrl ? <Image source={{ uri: openUrl }} style={styles.full} resizeMode="contain" /> : null}
          {open ? (
            <Text style={styles.fullCaption}>
              {open.label}
              {open.userName ? ` · ${open.userName}` : ''}
            </Text>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  strip: { gap: Spacing.md },
  tile: { width: 96, gap: Spacing.xs },
  thumb: { width: 96, height: 96, borderRadius: Radius.control },
  caption: { ...Typography.caption },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  full: { width: '100%', height: '80%' },
  fullCaption: { ...Typography.bodySmall, color: '#ffffff', textAlign: 'center' },
});
