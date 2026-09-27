import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ImageStyle, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/components/theme';
import { Radius, getColors } from '@/constants/theme';

interface CatalogProductThumbProps {
  uri: string | null | undefined;
  size?: number;
  /** Clave estable para reciclar la vista en listas (expo-image). */
  recyclingKey?: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
  /** Si hay imagen, tocarla la abre en grande (p. ej. `CatalogImageViewer`). */
  onPress?: () => void;
}

/**
 * Miniatura de una ficha o portada. Tamaño fijo y caché en disco para que
 * las listas no pesen; sin imagen, o si no carga (sin señal y sin caché),
 * muestra un marcador neutro. expo-image reduce el original a este tamaño al
 * decodificar, así que la lista no retiene fotos de 2.000 px en memoria.
 */
export function CatalogProductThumb({ uri, size = 56, recyclingKey, style, accessibilityLabel, onPress }: CatalogProductThumbProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const frame = { width: size, height: size, borderRadius: Radius.control, backgroundColor: colors.surface.sunken };
  // Se recuerda qué URL falló: si la fila se recicla con otra, se reintenta.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (!uri || failedUri === uri) {
    return (
      <View style={[styles.placeholder, frame, style as StyleProp<ViewStyle>]} accessibilityLabel={accessibilityLabel}>
        <MaterialIcons name="image" size={Math.round(size * 0.42)} color={colors.text.tertiary} />
      </View>
    );
  }

  const image = (
    <Image
      source={{ uri }}
      style={[frame, style]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      transition={120}
      accessibilityLabel={onPress ? undefined : accessibilityLabel}
      onError={() => setFailedUri(uri)}
    />
  );
  if (!onPress) return image;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Ver foto${accessibilityLabel ? ` de ${accessibilityLabel}` : ''}`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {image}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
