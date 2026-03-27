import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';

interface UnregisteredBarcodeAlertProps {
  barcode: string;
  onDismiss?: () => void;
}

export function UnregisteredBarcodeAlert({ barcode, onDismiss }: UnregisteredBarcodeAlertProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.title}>Producto no encontrado</Text>
      </View>
      
      <Text style={styles.message}>
        Este código de barras no está asociado a ningún producto.
      </Text>
      
      <View style={styles.barcodeContainer}>
        <Text style={styles.barcodeLabel}>Código escaneado:</Text>
        <Text style={styles.barcodeValue}>{barcode}</Text>
      </View>
      
      <View style={styles.instructionContainer}>
        <Text style={styles.instructionTitle}>Acción requerida:</Text>
        <Text style={styles.instructionText}>
          Comuníquese con el área de inventario para registrar este producto antes de continuar.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.error.main,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  errorIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.error.main,
    flex: 1,
  },
  message: {
    fontSize: 14,
    color: Colors.text.primary,
    marginBottom: 16,
    lineHeight: 20,
  },
  barcodeContainer: {
    backgroundColor: Colors.background.default,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  barcodeLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  barcodeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    fontFamily: 'monospace',
  },
  instructionContainer: {
    backgroundColor: Colors.warning.light,
    padding: 12,
    borderRadius: 8,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.warning.dark,
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.warning.dark,
    lineHeight: 18,
  },
});

