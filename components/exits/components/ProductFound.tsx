import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Database } from '@/types/database.types';
import { Colors } from '@/constants/theme';

type Product = Database['public']['Tables']['products']['Row'];

interface ProductFoundProps {
  product: Product;
  availableStock: number;
}

export function ProductFound({ product, availableStock }: ProductFoundProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Producto encontrado</Text>
          <View style={[styles.stockBadge, availableStock > 0 ? styles.stockAvailable : styles.stockUnavailable]}>
            <Text style={styles.stockText}>
              Stock: {availableStock}
            </Text>
          </View>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Nombre:</Text>
          <Text style={styles.value}>{product.name}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>SKU:</Text>
          <Text style={styles.value}>{product.sku}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Código de barras:</Text>
          <Text style={styles.value}>{product.barcode}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Stock disponible:</Text>
          <Text style={[styles.value, styles.stockValue]}>
            {availableStock} unidad{availableStock !== 1 ? 'es' : ''}
          </Text>
        </View>
        
        {product.description && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Descripción:</Text>
            <Text style={styles.value}>{product.description}</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    marginHorizontal: 20,
  },
  content: {
    // Contenido del card
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
  stockBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stockAvailable: {
    backgroundColor: Colors.success.light,
  },
  stockUnavailable: {
    backgroundColor: Colors.error.light,
  },
  stockText: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
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
  stockValue: {
    fontWeight: '700',
    color: Colors.info.main,
  },
});

