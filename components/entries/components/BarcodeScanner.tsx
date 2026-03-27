import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '@/constants/theme';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isProcessingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    // Prevenir múltiples escaneos simultáneos
    if (isProcessingRef.current || scanned || !data || !mountedRef.current) {
      return;
    }

    try {
      isProcessingRef.current = true;
      setScanned(true);
      setError(null);

      // Validar que el barcode tenga contenido
      const trimmedBarcode = data.trim();
      if (!trimmedBarcode) {
        throw new Error('Código de barras vacío');
      }

      // Llamar a onScan de forma segura
      if (typeof onScan === 'function') {
        await Promise.resolve(onScan(trimmedBarcode));
      }

      // Cerrar el scanner después de un breve delay para asegurar que el estado se actualizó
      setTimeout(() => {
        if (mountedRef.current) {
          setScanned(false);
          isProcessingRef.current = false;
        }
      }, 500);
    } catch (error: any) {
      console.error('Error processing barcode:', error);
      setError(error?.message || 'Error al procesar el código de barras');
      setScanned(false);
      isProcessingRef.current = false;
      
      // Permitir reintentar después de 2 segundos
      setTimeout(() => {
        if (mountedRef.current) {
          setScanned(false);
          isProcessingRef.current = false;
        }
      }, 2000);
    }
  };

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

  return (
    <View style={styles.container}>
      {permission?.granted && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned || isProcessingRef.current ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'code128'],
          }}
        />
      )}
      <View style={styles.overlay}>
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
            Escanea el código de barras del producto
          </Text>
        )}
      </View>
      <TouchableOpacity 
        style={styles.closeButton} 
        onPress={() => {
          isProcessingRef.current = false;
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
