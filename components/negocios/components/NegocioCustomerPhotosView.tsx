import { useTheme } from '@/components/theme';
import { SectionHeader } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { logHandledError } from '@/lib/errorMessage';
import { NEGOCIO_PHOTO_LABEL, getNegocioPhotoSignedUrl, type NegocioPhotoKind } from '@/lib/negocioPhotos';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  customerPhotoPath: string | null | undefined;
  idPhotoPath: string | null | undefined;
  /** Con señal: las URLs firmadas (1 h) las da el servidor. */
  online: boolean;
};

type PhotoEntry = { kind: NegocioPhotoKind; path: string };

/**
 * Fotos del cliente en el detalle del negocio: miniaturas con toque para
 * ampliar. Sin señal o sin fotos no se muestra nada; una URL que no se pueda
 * firmar se omite sin tumbar el detalle. No van en el contrato.
 */
export function NegocioCustomerPhotosView({ customerPhotoPath, idPhotoPath, online }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const photos = useMemo<PhotoEntry[]>(
    () =>
      [
        { kind: 'cliente' as const, path: customerPhotoPath || '' },
        { kind: 'cedula' as const, path: idPhotoPath || '' },
      ].filter((entry) => entry.path),
    [customerPhotoPath, idPhotoPath]
  );
  const [urls, setUrls] = useState<Partial<Record<NegocioPhotoKind, string>>>({});
  const [open, setOpen] = useState<NegocioPhotoKind | null>(null);
  const key = photos.map((photo) => photo.path).join('|');

  useEffect(() => {
    setUrls({});
    if (!online || !photos.length) return;
    let active = true;
    void Promise.all(
      photos.map(async (photo) => {
        try {
          return [photo.kind, await getNegocioPhotoSignedUrl(photo.path)] as const;
        } catch (error) {
          logHandledError('Negocio: abrir foto del cliente', error);
          return null;
        }
      })
    ).then((entries) => {
      if (!active) return;
      const next: Partial<Record<NegocioPhotoKind, string>> = {};
      for (const entry of entries) if (entry) next[entry[0]] = entry[1];
      setUrls(next);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online]);

  if (!online || !photos.length) return null;
  const openUrl = open ? urls[open] : undefined;

  return (
    <View style={styles.container} testID="negocio-fotos-cliente-detalle">
      <SectionHeader title="Fotos del cliente" />
      <View style={styles.strip}>
        {photos.map((photo) => {
          const url = urls[photo.kind];
          const label = NEGOCIO_PHOTO_LABEL[photo.kind];
          return (
            <Pressable
              key={photo.kind}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Ampliar ${label.toLowerCase()}`}
              onPress={() => setOpen(photo.kind)}
              disabled={!url}
              style={styles.tile}
            >
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={[styles.thumb, { backgroundColor: colors.background.paper }]}
                  testID={`negocio-foto-${photo.kind}`}
                />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.background.paper }]} />
              )}
              <Text numberOfLines={2} style={[styles.caption, { color: colors.text.secondary }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(null)}
          accessibilityRole="button"
          accessibilityLabel="Cerrar foto"
        >
          {openUrl ? <Image source={{ uri: openUrl }} style={styles.full} resizeMode="contain" /> : null}
          {open ? <Text style={styles.fullCaption}>{NEGOCIO_PHOTO_LABEL[open]}</Text> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
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
