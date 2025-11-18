import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Product } from '../../infrastructure/store/entriesStore';
import { Colors } from '@/constants/theme';

interface ProductFoundProps {
  product: Product;
}

export function ProductFound({ product }: ProductFoundProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Producto encontrado</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{product.status}</Text>
        </View>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Nombre:</Text>
        <Text style={styles.value}>{product.name}</Text>
      </View>
      
      {product.sku && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>SKU:</Text>
          <Text style={styles.value}>{product.sku}</Text>
        </View>
      )}
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Código de barras:</Text>
        <Text style={styles.value}>{product.barcode}</Text>
      </View>
      
      {product.description && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>Descripción:</Text>
          <Text style={styles.value}>{product.description}</Text>
        </View>
      )}
      
      {product.unit_of_measure && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>Unidad de medida:</Text>
          <Text style={styles.value}>{product.unit_of_measure}</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  statusBadge: {
    backgroundColor: Colors.success.light,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: Colors.success.dark,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginRight: 8,
    minWidth: 120,
  },
  value: {
    fontSize: 14,
    color: Colors.text.primary,
    flex: 1,
  },
});

