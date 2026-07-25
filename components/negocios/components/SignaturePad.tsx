import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Text,
  Pressable,
  Modal,
  Image,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

interface Props {
  label: string;
  value?: string;
  onChange: (dataUrl: string) => void;
}

/**
 * Campo de firma: preview + botón; al tocar abre modal a pantalla completa.
 */
export function SignaturePad({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        value.includes('svg') || value.endsWith('.svg') ? (
          <View style={[styles.previewBox, styles.signedPreview]}>
            <Text style={styles.signedText}>Firma capturada</Text>
          </View>
        ) : (
          <View style={styles.previewBox}>
            <Image
              source={{ uri: value }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          </View>
        )
      ) : (
        <View style={styles.emptyPreview}>
          <Text style={styles.emptyText}>Sin firma</Text>
        </View>
      )}
      <Pressable
        style={styles.openBtn}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Text style={styles.openBtnText}>
          {value ? 'Volver a firmar' : 'Firmar'}
        </Text>
      </Pressable>

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

  const padW = Math.max(280, width - (landscape ? 48 : 24));
  const padH = Math.max(
    220,
    landscape ? height - insets.top - insets.bottom - 120 : height * 0.55
  );

  const pathsRef = useRef<string[]>([]);
  const currentRef = useRef<string>('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const buildDataUrl = () => {
    const all = pathsRef.current.join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(
      padW
    )}" height="${Math.round(padH)}" viewBox="0 0 ${Math.round(padW)} ${Math.round(
      padH
    )}" style="background:#fff">${all}</svg>`;
    // base64 para Storage (image/svg+xml)
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${b64}`;
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          currentRef.current = `M${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
          setTick((t) => t + 1);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          currentRef.current += ` L${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
          setTick((t) => t + 1);
        },
        onPanResponderRelease: () => {
          if (currentRef.current) {
            pathsRef.current.push(
              `<path d="${currentRef.current}" stroke="#111" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
            );
            currentRef.current = '';
            setTick((t) => t + 1);
          }
        },
      }),
    []
  );

  const displayPath = useMemo(() => {
    void tick;
    return [
      ...pathsRef.current.map((p) => {
        const m = p.match(/d="([^"]+)"/);
        return m?.[1] || '';
      }),
      currentRef.current,
    ].filter(Boolean);
  }, [tick]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
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
            {landscape
              ? 'Firme en el área blanca · Confirme al terminar'
              : 'Gire el teléfono (horizontal) si le resulta más cómodo'}
          </Text>
        </View>

        <View
          style={[styles.fullPad, { width: padW, height: padH }]}
          {...pan.panHandlers}
        >
          <Svg width={padW} height={padH}>
            {displayPath.map((d, i) => (
              <Path
                key={`${i}-${d.slice(0, 12)}`}
                d={d}
                stroke="#111"
                strokeWidth={2.5}
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
            onPress={() => onConfirm(buildDataUrl())}
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
  signedPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    borderColor: '#81c784',
  },
  signedText: { color: '#2e7d32', fontWeight: '700', fontSize: 14 },
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
  openBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  openBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
