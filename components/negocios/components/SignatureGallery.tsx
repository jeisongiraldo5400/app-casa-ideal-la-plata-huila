import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';

export type SignatureEntry = { label: string; url: string };

/** Firmas en solo lectura (cliente, fiador, vendedor). */
export function SignatureGallery({ signatures }: { signatures: SignatureEntry[] }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (!signatures.length) return null;

  return (
    <View style={styles.grid}>
      {signatures.map(({ label, url }) => (
        <View key={label} style={styles.item} accessible accessibilityLabel={`Firma de ${label.toLowerCase()}`}>
          <View style={[styles.frame, { borderColor: colors.divider, backgroundColor: colors.background.paper }]}>
            {url.toLowerCase().includes('.svg') ? (
              <SvgUri uri={url} width="100%" height="100%" />
            ) : (
              <Image source={{ uri: url }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
            )}
          </View>
          <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  item: { gap: Spacing.xs },
  frame: { width: 140, height: 70, borderWidth: 1, borderRadius: Radius.control, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  label: { ...Typography.metadata },
});
