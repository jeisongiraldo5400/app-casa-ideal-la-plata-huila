import { useTheme } from '@/components/theme';
import { ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CustomerDirectoryRow } from '../infrastructure/services/customersDirectoryService';

interface CustomerListCardProps {
  customer: CustomerDirectoryRow;
  onPress: () => void;
  /** Oculta el vendedor en la pestaña «Mis clientes», donde siempre sería el mismo. */
  showSeller?: boolean;
}

export function CustomerListCard({ customer, onPress, showSeller = true }: CustomerListCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const location = [customer.vereda_name, customer.municipio_name].filter(Boolean).join(' · ');

  return (
    <ListCard onPress={onPress} accessibilityLabel={`Abrir cliente ${customer.name}`}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
            {customer.name}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
            {customer.id_number || 'Sin documento'}
            {customer.phone ? ` · ${customer.phone}` : ''}
          </Text>
          {location ? (
            <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
              {location}
            </Text>
          ) : null}
          {showSeller ? (
            <View style={styles.sellerRow}>
              {customer.seller_id ? (
                <StatusChip label={customer.seller_name || 'Vendedor asignado'} tone="info" />
              ) : (
                <StatusChip label="Sin vendedor" tone="warning" />
              )}
            </View>
          ) : null}
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.text.secondary} />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  info: { flex: 1, gap: 2 },
  name: { ...Typography.bodyStrong },
  meta: { ...Typography.metadata },
  sellerRow: { flexDirection: 'row', marginTop: Spacing.xs },
});
