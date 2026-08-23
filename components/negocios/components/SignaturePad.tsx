import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Text,
  Pressable,
  Modal,
  Image,
  Alert,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, SvgUri, SvgXml } from 'react-native-svg';
import {
  fitSignaturePad,
  mapPointToSignature,
  SIGNATURE_CANVAS_HEIGHT,
  SIGNATURE_CANVAS_WIDTH,
} from '@/lib/signatureGeometry';
import { validateTransparentPngUri } from '@/lib/signaturePng';

interface Props {
  label: string;
  value?: string;
  onChange: (dataUrl: string) => void;
}

function SignaturePreview({ value }: { value: string }) {
  const normalized = value.toLowerCase();

  if (normalized.startsWith('data:image/svg+xml')) {
    const base64 = value.split(',')[1];
    if (!base64) return null;
    try {
      const xml = decodeURIComponent(escape(atob(base64)));
      return <SvgXml xml={xml} width="100%" height="100%" />;
    } catch {
      return <Text style={styles.previewError}>No se pudo mostrar la firma</Text>;
    }
  }

  if (normalized.includes('.svg')) {
    return <SvgUri uri={value} width="100%" height="100%" />;
  }

  return (
    <Image
      source={{ uri: value }}
      style={styles.previewImage}
      resizeMode="contain"
    />
  );
}

/**
 * Campo de firma: preview + botón; al tocar abre modal a pantalla completa.
 */
export function SignaturePad({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const selectPng = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/png',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if ((asset.mimeType || '').toLowerCase() !== 'image/png') {
        throw new Error('Solo se permiten archivos PNG');
      }
      await validateTransparentPngUri(asset.uri);
      onChange(asset.uri);
    } catch (error) {
      Alert.alert('PNG inválido', error instanceof Error ? error.message : 'No se pudo cargar el PNG');
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.previewBox}>
          <SignaturePreview value={value} />
        </View>
      ) : (
        <View style={styles.emptyPreview}>
          <Text style={styles.emptyText}>Sin firma</Text>
        </View>
      )}
      <View style={styles.actions}>
        <Pressable style={styles.openBtn} onPress={() => setOpen(true)} accessibilityRole="button">
          <Text style={styles.openBtnText}>{value ? 'Volver a firmar' : 'Firmar'}</Text>
        </Pressable>
        <Pressable style={styles.uploadBtn} onPress={() => void selectPng()} accessibilityRole="button">
          <Text style={styles.uploadBtnText}>Subir PNG</Text>
        </Pressable>
        {value ? (
          <Pressable style={styles.removeBtn} onPress={() => onChange('')} accessibilityRole="button">
            <Text style={styles.removeBtnText}>Quitar</Text>
          </Pressable>
        ) : null}
      </View>

      <SignatureFullscreenModal
        visible={open}
        title={label}
        onCancel={() => setOpen(false)}
        onConfirm={(dataUrl) => {
          onChange(dataUrl);
          setOpen(false);
        }}
      />
    </View>
  );
}

function SignatureFullscreenModal({
  visible,
  title,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const { width: padW, height: padH } = fitSignaturePad(
    width - (landscape ? 48 : 24),
    height - insets.top - insets.bottom - (landscape ? 150 : 210)
  );

  const pathsRef = useRef<string[]>([]);
  const currentRef = useRef<string>('');
  const svgRef = useRef<React.ElementRef<typeof Svg>>(null);
  const [tick, setTick] = useState(0);
  const hasStroke = pathsRef.current.length > 0 || Boolean(currentRef.current);

  const reset = () => {
    pathsRef.current = [];
    currentRef.current = '';
    setTick((t) => t + 1);
  };

  // Reset al abrir
  React.useEffect(() => {
    if (visible) reset();
  }, [visible]);

  const confirmPng = () => {
    svgRef.current?.toDataURL(
      (base64: string) => onConfirm(`data:image/png;base64,${base64}`),
      { width: SIGNATURE_CANVAS_WIDTH, height: SIGNATURE_CANVAS_HEIGHT }
    );
  };

  const finishStroke = React.useCallback(() => {
    if (!currentRef.current) return;
    pathsRef.current.push(currentRef.current);
    currentRef.current = '';
    setTick((t) => t + 1);
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const point = mapPointToSignature(
            locationX,
            locationY,
            padW,
            padH
          );
          currentRef.current = `M${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
          setTick((t) => t + 1);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const point = mapPointToSignature(
            locationX,
            locationY,
            padW,
            padH
          );
          currentRef.current += ` L${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
          setTick((t) => t + 1);
        },
        onPanResponderRelease: finishStroke,
        onPanResponderTerminate: finishStroke,
      }),
    [finishStroke, padH, padW]
  );

  const displayPath = useMemo(() => {
    void tick;
    return [...pathsRef.current, currentRef.current].filter(Boolean);
  }, [tick]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait']}
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <StatusBar barStyle="dark-content" />
      <View
        style={[
          styles.modalRoot,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
            paddingHorizontal: landscape ? 16 : 12,
          },
        ]}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalHint}>
            Firme en el área blanca y confirme al terminar
          </Text>
        </View>

        <View
          style={[styles.fullPad, { width: padW, height: padH }]}
          {...pan.panHandlers}
        >
          <Svg
            ref={svgRef}
            width={padW}
            height={padH}
            viewBox={`0 0 ${SIGNATURE_CANVAS_WIDTH} ${SIGNATURE_CANVAS_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ backgroundColor: '#fff' }}
          >
            <Rect
              x={0}
              y={0}
              width={SIGNATURE_CANVAS_WIDTH}
              height={SIGNATURE_CANVAS_HEIGHT}
              fill="#fff"
            />
            {displayPath.map((d, i) => (
              <Path
                key={`${i}-${d.slice(0, 12)}`}
                d={d}
                stroke="#111"
                strokeWidth={8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
          {!hasStroke && (
            <View style={styles.padPlaceholder} pointerEvents="none">
              <Text style={styles.padPlaceholderText}>Firme aquí</Text>
            </View>
          )}
        </View>

        <View style={styles.modalActions}>
          <Pressable style={styles.secondaryBtn} onPress={onCancel}>
            <Text style={styles.secondaryBtnText}>Cancelar</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={reset}>
            <Text style={styles.secondaryBtnText}>Limpiar</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, !hasStroke && styles.btnDisabled]}
            disabled={!hasStroke}
            onPress={confirmPng}
          >
            <Text style={styles.primaryBtnText}>Confirmar firma</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { fontWeight: '600', fontSize: 14 },
  previewBox: {
    height: 100,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  previewError: { color: '#b91c1c', fontSize: 12, textAlign: 'center' },
  emptyPreview: {
    height: 72,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  emptyText: { color: '#888', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  openBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  openBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  uploadBtn: { borderWidth: 1, borderColor: '#1565c0', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  uploadBtnText: { color: '#1565c0', fontWeight: '700', fontSize: 15 },
  removeBtn: { borderWidth: 1, borderColor: '#777', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  removeBtnText: { color: '#444', fontWeight: '700', fontSize: 15 },
  modalRoot: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    gap: 10,
  },
  modalHeader: { gap: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  modalHint: { fontSize: 13, color: '#666' },
  fullPad: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  padPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padPlaceholderText: { color: '#bbb', fontSize: 20, fontWeight: '500' },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 'auto',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  secondaryBtnText: { color: '#222', fontWeight: '600' },
  primaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#1565c0',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
});
