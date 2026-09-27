import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';
import { useProductGallery, type ImagePreviewTarget } from '../infrastructure/hooks/useProductGallery';

interface CatalogImageViewerProps {
  /** null = cerrado. */
  target: ImagePreviewTarget | null;
  onClose: () => void;
}

// Fondo oscuro fijo en ambos temas: la foto es lo único que importa aquí.
const BACKDROP = '#000000';
const ON_BACKDROP = '#FFFFFF';
const ON_BACKDROP_MUTED = 'rgba(255,255,255,0.7)';
const CLOSE_BACKGROUND = 'rgba(255,255,255,0.18)';

/**
 * Vista ampliada de solo lectura: la foto a pantalla completa y, si la ficha
 * tiene varias, se pasan deslizando. Sin subir, editar ni descargar: en móvil
 * las fotos solo se miran (las carga el panel web).
 */
export function CatalogImageViewer({ target, onClose }: CatalogImageViewerProps) {
  // Cerrado no monta nada: ni el Modal ni la consulta de la galería.
  if (!target) return null;
  return <OpenImageViewer target={target} onClose={onClose} />;
}

function OpenImageViewer({ target, onClose }: { target: ImagePreviewTarget; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { urls, loading } = useProductGallery(target);
  const [index, setIndex] = useState(0);
  const [openedFor, setOpenedFor] = useState(target);
  if (openedFor !== target) {
    setOpenedFor(target);
    setIndex(0);
  }

  const pageHeight = height - insets.top - insets.bottom - 64;

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {target.title}
            </Text>
            {urls.length > 1 ? <Text style={styles.counter}>{`${Math.min(index + 1, urls.length)} / ${urls.length}`}</Text> : null}
          </View>
          {loading ? <ActivityIndicator color={ON_BACKDROP_MUTED} accessibilityLabel="Cargando más fotos" /> : null}
          {/* Fondo propio: el del tema es claro y dejaba la X blanca invisible. */}
          <IconButton
            icon="close"
            size={26}
            color={ON_BACKDROP}
            backgroundColor={CLOSE_BACKGROUND}
            style={styles.close}
            onPress={onClose}
            accessibilityLabel="Cerrar imagen"
          />
        </View>

        {urls.length === 0 ? (
          <ImageUnavailable message="Este producto no tiene fotos." />
        ) : (
          <FlatList
            data={urls}
            keyExtractor={(url) => url}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialNumToRender={1}
            windowSize={3}
            getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
            onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)))}
            renderItem={({ item, index: itemIndex }) => (
              <ZoomableImage uri={item} width={width} height={pageHeight} label={`${target.title}, foto ${itemIndex + 1}`} />
            )}
          />
        )}
      </View>
    </Modal>
  );
}

/** En iOS se amplía con dos dedos (zoom nativo del ScrollView); en Android se ve completa. */
function ZoomableImage({ uri, width, height, label }: { uri: string; width: number; height: number; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={{ width, height }}>
        <ImageUnavailable message="No se pudo cargar la foto. Revisa la conexión." />
      </View>
    );
  }
  return (
    <ScrollView
      style={{ width, height }}
      contentContainerStyle={styles.zoomContent}
      maximumZoomScale={3}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}>
      <Image
        source={{ uri }}
        style={{ width, height }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={150}
        accessibilityLabel={label}
        onError={() => setFailed(true)}
      />
    </ScrollView>
  );
}

function ImageUnavailable({ message }: { message: string }) {
  return (
    <View style={styles.unavailable}>
      <MaterialIcons name="image-not-supported" size={48} color={ON_BACKDROP_MUTED} />
      <Text style={styles.unavailableText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  headerText: { flex: 1, gap: 2 },
  title: { ...Typography.bodyStrong, color: ON_BACKDROP },
  close: { borderColor: 'rgba(255,255,255,0.35)' },
  counter: { ...Typography.caption, color: ON_BACKDROP_MUTED },
  zoomContent: { alignItems: 'center', justifyContent: 'center' },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  unavailableText: { ...Typography.bodySmall, color: ON_BACKDROP_MUTED, textAlign: 'center' },
});
