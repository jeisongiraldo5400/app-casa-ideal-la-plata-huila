import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { Database } from '@/types/database.types';
import { getColors, type ThemeColors } from '@/constants/theme';

type Product = Database['public']['Tables']['products']['Row'];

interface ProductFoundProps {
  product: Product;
  availableStock: number;
}

export function ProductFound({ product, availableStock }: ProductFoundProps) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  return (
    <Card style={styles.card}>
      <View style={styles.content}>
        <View style={styles.header}>
            <Text style={styles.title}>Listo para agregar</Text>
          <View style={[styles.stockBadge, availableStock > 0 ? styles.stockAvailable : styles.stockUnavailable]}>
            <Text style={styles.stockText}>
              Pendiente: {availableStock}
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
        
      </View>
    </Card>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
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
    backgroundColor: Colors.success.main + '24',
  },
  stockUnavailable: {
    backgroundColor: Colors.error.main + '24',
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
