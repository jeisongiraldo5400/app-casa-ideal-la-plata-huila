import { logOperationError } from '@/lib/operationLogger';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Momento del último desmontaje de una CameraView, a nivel de módulo (no por instancia). */
let lastCameraTeardownAt = 0;
/** Tiempo mínimo entre desmontar una cámara y montar la siguiente, para darle a Android
 * margen de liberar el dispositivo antes de que otra sesión intente adquirirlo (ver el
 * comentario sobre expo/expo#35386 más abajo). */
const CAMERA_REMOUNT_COOLDOWN_MS = 400;

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  title?: string;
  instruction?: string;
  contextLabel?: string;
  /** When false, ignore reads without detaching onBarcodeScanned (iOS crash). */
  active?: boolean;
  /** Módulo que llama al escáner, para etiquetar correctamente los logs de error remotos. */
  logModule?: 'entries' | 'exits';
}

export function BarcodeScanner({
  onScan,
  onClose,
  title = 'Escanear producto',
  instruction = 'Escanea el código de barras del producto',
  contextLabel,
  active = true,
  logModule,
}: BarcodeScannerProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Never attach onBarcodeScanned until native session is ready (avoids crashes). */
  const [cameraReady, setCameraReady] = useState(false);
  /** Defer mounting CameraView so it does not race with screen transition (expo/expo#35386). */
  const [deferMountCamera, setDeferMountCamera] = useState(false);
  const isProcessingRef = useRef(false);
  const scannedRef = useRef(false);
  const mountedRef = useRef(true);
  const activeRef = useRef(active);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  activeRef.current = active;

  useEffect(() => {
    scannedRef.current = scanned;
  }, [scanned]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lastCameraTeardownAt = Date.now();
    };
  }, []);

  useEffect(() => {
    // Si otra CameraView se acaba de desmontar hace muy poco (p. ej. al terminar una
    // entrada y abrir el escáner de la siguiente), espera lo que falte del cooldown
    // además del delay base, para no montar una nueva sesión de cámara mientras Android
    // todavía está liberando el dispositivo de la anterior.
    const sinceTeardown = Date.now() - lastCameraTeardownAt;
    const delay = Math.max(250, CAMERA_REMOUNT_COOLDOWN_MS - sinceTeardown);
    const t = setTimeout(() => setDeferMountCamera(true), delay);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (active) {
      isProcessingRef.current = false;
      scannedRef.current = false;
      setScanned(false);
      setError(null);
    }
  }, [active]);

  const handleBarCodeScanned = useCallback(async ({ data }: { data: string }) => {
    // Prevenir múltiples escaneos simultáneos (use ref so callback stays stable for iOS)
    if (
      !activeRef.current ||
      isProcessingRef.current ||
      scannedRef.current ||
      !data ||
      !mountedRef.current
    ) {
      return;
    }

    try {
      isProcessingRef.current = true;
      scannedRef.current = true;
      setScanned(true);
      setError(null);

      // Validar que el barcode tenga contenido
      const trimmedBarcode = data.trim();
      if (!trimmedBarcode) {
        throw new Error('Código de barras vacío');
      }

      const scan = onScanRef.current;
      if (typeof scan === 'function') {
        await Promise.resolve(scan(trimmedBarcode));
      }

      // Cerrar el scanner después de un breve delay para asegurar que el estado se actualizó
      setTimeout(() => {
        if (mountedRef.current) {
          scannedRef.current = false;
          setScanned(false);
          isProcessingRef.current = false;
        }
      }, 500);
    } catch (error: any) {
      console.error('Error processing barcode:', error);
      setError(error?.message || 'Error al procesar el código de barras');
      scannedRef.current = false;
      setScanned(false);
      isProcessingRef.current = false;
      
      // Permitir reintentar después de 2 segundos
      setTimeout(() => {
        if (mountedRef.current) {
          scannedRef.current = false;
          setScanned(false);
          isProcessingRef.current = false;
        }
      }, 2000);
    }
  }, []);

  const onCameraReady = useCallback(() => {
    setError(null);
    setCameraReady(true);
  }, []);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Solicitando permiso para la cámara...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No se tiene acceso a la cámara</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Solicitar permiso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.closeButtonStyle]} onPress={onClose}>
          <Text style={styles.buttonText}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Keep a stable function reference for onBarcodeScanned when enabled — toggling undefined/function on iOS can crash (expo/expo#35386).
  // Android puede comenzar a emitir lecturas antes de notificar onCameraReady.
  // En iOS conservamos la espera porque evita la carrera al montar la sesión nativa.
  const canReadBarcode = Platform.OS !== 'ios' || cameraReady;
  const barcodeHandler =
    permission?.granted && canReadBarcode && deferMountCamera ? handleBarCodeScanned : undefined;

  return (
    <View style={styles.container}>
      {permission?.granted && deferMountCamera && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          active={active}
          onCameraReady={onCameraReady}
          onMountError={({ message }) => {
            const errorMessage = message || 'No fue posible iniciar la cámara';
            console.error('[BarcodeScanner] onMountError:', errorMessage);
            setError(errorMessage);
            if (logModule) {
              void logOperationError({
                error_code: 'CAMERA_MOUNT_ERROR',
                error_message: errorMessage,
                module: logModule,
                operation: 'barcode_scanner_mount',
                severity: 'error',
              });
            }
          }}
          onBarcodeScanned={barcodeHandler}
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code128',
              'code39',
              'code93',
              'codabar',
              'itf14',
              'qr',
              'datamatrix',
              'pdf417',
              'aztec',
            ],
          }}
        />
      )}
      <View
        pointerEvents="none"
        style={[styles.contextHeader, { top: Math.max(insets.top, 16) }]}
      >
        <Text style={styles.contextTitle}>{title}</Text>
        {contextLabel ? <Text style={styles.contextLabel} numberOfLines={1}>{contextLabel}</Text> : null}
      </View>
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.scanArea} />
        {scanned ? (
          <Text style={styles.processingText}>Procesando código...</Text>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.instructionText}>
              Intenta escanear de nuevo
            </Text>
          </View>
        ) : (
          <Text style={styles.instructionText}>
            {instruction}
          </Text>
        )}
      </View>
      <TouchableOpacity 
        style={[styles.closeButton, { bottom: Math.max(insets.bottom + 20, 40) }]}
        onPress={() => {
          isProcessingRef.current = false;
          scannedRef.current = false;
          setScanned(false);
          onClose();
        }}
        disabled={isProcessingRef.current}
      >
        <Text style={styles.closeButtonText}>Cerrar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextHeader: {
    alignItems: 'center',
    left: 20,
    position: 'absolute',
    right: 20,
    zIndex: 2,
  },
  contextTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  contextLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    marginTop: 4,
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: Colors.primary.main,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  instructionText: {
    marginTop: 20,
    color: Colors.background.paper,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  processingText: {
    marginTop: 20,
    color: Colors.success.main,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
    fontWeight: '600',
  },
  errorContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: Colors.error.main,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  closeButtonText: {
    color: Colors.background.paper,
    fontSize: 16,
    fontWeight: '600',
  },
  text: {
    color: Colors.text.primary,
    fontSize: 16,
    marginBottom: 20,
  },
  errorText: {
    color: Colors.error.main,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: Colors.primary.main,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 12,
  },
  closeButtonStyle: {
    backgroundColor: Colors.error.main,
  },
  buttonText: {
    color: Colors.background.paper,
    fontSize: 16,
    fontWeight: '600',
  },
});
