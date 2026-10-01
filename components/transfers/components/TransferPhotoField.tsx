import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { logHandledError } from '@/lib/errorMessage';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { pickTransferPhoto, type TransferPhotoSource } from '../infrastructure/services/pickTransferPhoto';
import type { TransferPhotoDraft } from '../utils/transferPhotos';

type Props = {
  label: string;
  photo: TransferPhotoDraft | null;
  onChange: (photo: TransferPhotoDraft | null) => void;
  disabled?: boolean;
};

/** Foto opcional: cámara o galería, miniatura y «Quitar». */
export function TransferPhotoField({ label, photo, onChange, disabled }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [picking, setPicking] = useState(false);

  const pick = async (source: TransferPhotoSource) => {
    setPicking(true);
    try {
      const picked = await pickTransferPhoto(source);
      if (picked) onChange(picked);
    } catch (error) {
      logHandledError('Traslados: foto', error);
    } finally {
      setPicking(false);
    }
  };

  const busy = disabled || picking;
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      {photo ? (
        <View style={styles.row}>
          <Image
            source={{ uri: photo.uri }}
            style={[styles.thumb, { backgroundColor: colors.background.paper }]}
            accessibilityLabel={`${label}: foto adjunta`}
          />
          <Button title="Quitar" variant="ghost" size="sm" icon="close" onPress={() => onChange(null)} disabled={disabled} />
        </View>
      ) : (
        <View style={styles.row}>
          <Button
            title="Tomar foto"
            variant="outline"
            size="sm"
            icon="photo-camera"
            onPress={() => void pick('camera')}
            disabled={busy}
            style={styles.button}
          />
          <Button
            title="Galería"
            variant="outline"
            size="sm"
            icon="photo-library"
            onPress={() => void pick('gallery')}
            disabled={busy}
            style={styles.button}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },
  label: { ...Typography.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  button: { flex: 1 },
  thumb: { width: 72, height: 72, borderRadius: Radius.control },
});
