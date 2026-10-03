import { useTheme } from '@/components/theme';
import { Button, SectionHeader } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { logHandledError } from '@/lib/errorMessage';
import { NEGOCIO_PHOTO_LABEL, type NegocioPhotoDraft, type NegocioPhotoKind } from '@/lib/negocioPhotos';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { pickNegocioPhoto, type NegocioPhotoSource } from '../infrastructure/services/pickNegocioPhoto';

type Props = {
  customerPhoto: NegocioPhotoDraft | null;
  /** Cédula por el frente. */
  idPhoto: NegocioPhotoDraft | null;
  /** Cédula por atrás. */
  idBackPhoto?: NegocioPhotoDraft | null;
  onChange: (kind: NegocioPhotoKind, photo: NegocioPhotoDraft | null) => void;
  disabled?: boolean;
};

/**
 * «Fotos del cliente (opcional)» del asistente: foto de la persona y de su
 * cédula por el frente y por atrás. Nada aquí bloquea guardar el negocio.
 */
export function NegocioCustomerPhotosSection({ customerPhoto, idPhoto, idBackPhoto = null, onChange, disabled }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={styles.container} testID="negocio-fotos-cliente">
      <SectionHeader title="Fotos del cliente (opcional)" />
      <Text style={[styles.helper, { color: colors.text.secondary }]}>
        Si quiere, tome una foto del cliente o de su cédula por ambos lados. No es obligatorio para guardar el negocio.
      </Text>
      <PhotoSlot kind="cliente" photo={customerPhoto} onChange={onChange} disabled={disabled} />
      <PhotoSlot kind="cedula" photo={idPhoto} onChange={onChange} disabled={disabled} />
      <PhotoSlot kind="cedula_atras" photo={idBackPhoto} onChange={onChange} disabled={disabled} />
    </View>
  );
}

function PhotoSlot({
  kind,
  photo,
  onChange,
  disabled,
}: {
  kind: NegocioPhotoKind;
  photo: NegocioPhotoDraft | null;
  onChange: Props['onChange'];
  disabled?: boolean;
}) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [picking, setPicking] = useState(false);
  const label = NEGOCIO_PHOTO_LABEL[kind];

  const pick = async (source: NegocioPhotoSource) => {
    setPicking(true);
    try {
      const picked = await pickNegocioPhoto(source);
      if (picked) onChange(kind, picked);
    } catch (error) {
      logHandledError('Negocio: foto del cliente', error);
    } finally {
      setPicking(false);
    }
  };

  const busy = disabled || picking;
  return (
    <View style={styles.slot}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      {photo ? (
        <View style={styles.row}>
          <Image
            source={{ uri: photo.uri }}
            style={[styles.thumb, { backgroundColor: colors.background.paper }]}
            accessibilityLabel={`${label}: foto adjunta`}
          />
          <Button
            title="Quitar"
            variant="ghost"
            size="sm"
            icon="close"
            onPress={() => onChange(kind, null)}
            disabled={disabled}
            accessibilityLabel={`Quitar ${label.toLowerCase()}`}
          />
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
            accessibilityLabel={`Tomar ${label.toLowerCase()}`}
          />
          <Button
            title="Galería"
            variant="outline"
            size="sm"
            icon="photo-library"
            onPress={() => void pick('gallery')}
            disabled={busy}
            style={styles.button}
            accessibilityLabel={`Elegir ${label.toLowerCase()} de la galería`}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm, marginTop: Spacing.md },
  helper: { ...Typography.caption },
  slot: { gap: Spacing.xs },
  label: { ...Typography.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  button: { flex: 1 },
  thumb: { width: 72, height: 72, borderRadius: Radius.control },
});
