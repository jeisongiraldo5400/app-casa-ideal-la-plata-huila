import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import { useTheme } from '@/components/theme';
import { OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Valor del selector cuando no hay categoría elegida. */
const TODAS = '';

/**
 * Filtro por categoría del listado de productos.
 *
 * El filtro lo aplica el servidor (`p_category_id`, migración 20261119120000):
 * la lista viene paginada, así que filtrar aquí dejaría fuera los productos de
 * las páginas que todavía no se han traído.
 *
 * No se pinta si no hay categorías (base recién montada o fallo al cargarlas):
 * un selector con una sola opción solo estorba.
 */
export function CategoryFilter() {
  const { categories, selectedCategoryId, setSelectedCategory, loadCategories } = useInventory();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  React.useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const options = React.useMemo(
    () => [
      { value: TODAS, label: 'Todas las categorías' },
      ...categories.map((category) => ({ value: category.id, label: category.name || 'Sin nombre' })),
    ],
    [categories]
  );

  if (categories.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text.primary }]}>Filtrar por categoría:</Text>
      <OptionPickerField
        value={selectedCategoryId ?? TODAS}
        onValueChange={(value) => setSelectedCategory(value === TODAS ? null : value)}
        options={options}
        placeholder="Todas las categorías"
        modalTitle="Categoría"
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs, marginBottom: Spacing.md },
  label: { ...Typography.metadata },
});
