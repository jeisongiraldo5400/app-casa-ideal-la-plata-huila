import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/components/theme';
import { Radius, getColors } from '@/constants/theme';

interface CatalogProductThumbProps {
  uri: string | null | undefined;
  size?: number;
  /** Clave estable para reciclar la vista en listas (expo-image). */
  recyclingKey?: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/**
 * Miniatura de una ficha o portada. Tamaño fijo y caché en disco para que
 * las listas no pesen; sin imagen muestra un marcador neutro.
 */
export function CatalogProductThumb({ uri, size = 56, recyclingKey, style, accessibilityLabel }: CatalogProductThumbProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const frame = { width: size, height: size, borderRadius: Radius.control, backgroundColor: colors.surface.sunken };

  if (!uri) {
    return (
      <View style={[styles.placeholder, frame, style as StyleProp<ViewStyle>]} accessibilityLabel={accessibilityLabel}>
        <MaterialIcons name="image" size={Math.round(size * 0.42)} color={colors.text.tertiary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[frame, style]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      transition={120}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
