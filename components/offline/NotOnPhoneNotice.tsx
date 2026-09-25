import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

/**
 * «Preparar el teléfono» v3: la descarga no trae los negocios cerrados ni los
 * anulados (con sus cuotas y pagos). Sin señal, que no aparezcan es lo
 * esperable y no un fallo de la descarga.
 */
export const CLOSED_NEGOCIOS_NOT_ON_PHONE_MESSAGE =
  'Sin señal solo están los negocios abiertos: los cerrados y los anulados no se llevan en el teléfono.';

type Props = { fromCache: boolean };

/** Línea para estados vacíos sin señal (lista de negocios filtrada o buscada). */
export function NotOnPhoneNotice({ fromCache }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (!fromCache) return null;
  return (
    <Text style={[styles.text, { color: colors.text.secondary }]} testID="not-on-phone-notice">
      {CLOSED_NEGOCIOS_NOT_ON_PHONE_MESSAGE}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing.lg },
});
