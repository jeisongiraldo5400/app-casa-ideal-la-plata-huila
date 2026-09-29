import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { IconButton, ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import { CatalogProductThumb } from './CatalogProductThumb';

interface ProductPickerRowProps {
  item: PublicCatalogListingItem;
  selected: boolean;
  pending: boolean;
  onToggle: () => void;
  /** Abre la foto en grande; tocar la miniatura no cambia la selección. */
  onPreview?: () => void;
  /**
   * `catalog` (por defecto): añadir/quitar de una edición. `checkbox`: casilla
   * para elegir varios antes de enviar («Enviar productos por WhatsApp»).
   */
  variant?: 'catalog' | 'checkbox';
}

export function ProductPickerRow({ item, selected, pending, onToggle, onPreview, variant = 'catalog' }: ProductPickerRowProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const meta = [item.categoryName, item.brandName].filter(Boolean).join(' · ');
  const checkbox = variant === 'checkbox';
  const stateLabel = checkbox ? (selected ? 'seleccionado' : 'sin seleccionar') : selected ? 'en el catálogo' : 'no seleccionado';
  const icon = checkbox ? (selected ? 'check-box' : 'check-box-outline-blank') : selected ? 'check-circle' : 'add-circle-outline';
  const actionLabel = checkbox
    ? selected
      ? `Quitar ${item.displayName} de la selección`
      : `Seleccionar ${item.displayName}`
    : selected
      ? 'Quitar del catálogo'
      : 'Añadir al catálogo';

  return (
    <ListCard
      onPress={onToggle}
      disabled={pending}
      accessibilityLabel={`${item.displayName}${item.stockQuantity === 0 ? ', agotado' : ''}, ${stateLabel}`}>
      <View style={styles.row}>
        <CatalogProductThumb
          uri={item.coverImageUrl}
          size={64}
          recyclingKey={item.productId}
          accessibilityLabel={item.displayName}
          onPress={onPreview}
        />
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>
            {item.displayName}
          </Text>
          {meta ? (
            <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {/* Solo la señal de agotado, como el selector web: la cantidad nunca se muestra. */}
          {item.stockQuantity === 0 ? (
            <View style={styles.badge}>
              <StatusChip label="Agotado" tone="error" />
            </View>
          ) : null}
        </View>
        <IconButton
          icon={icon}
          color={selected ? colors.success.dark : colors.primary.main}
          onPress={onToggle}
          disabled={pending}
          accessibilityLabel={actionLabel}
        />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  copy: { flex: 1, gap: 2 },
  name: { ...Typography.bodyStrong },
  meta: { ...Typography.caption },
  badge: { flexDirection: 'row', marginTop: Spacing.xs },
});
