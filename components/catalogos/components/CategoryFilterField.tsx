import React, { useMemo } from 'react';
import { useTheme } from '@/components/theme';
import { OptionPickerField } from '@/components/ui';
import { getColors } from '@/constants/theme';
import type { PublicCatalogCategory } from '@/lib/catalogos/publicCatalogTypes';

interface CategoryFilterFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  categories: PublicCatalogCategory[];
}

export function CategoryFilterField({ value, onValueChange, categories }: CategoryFilterFieldProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const options = useMemo(() => categories.map((category) => ({ value: category.id, label: category.name })), [categories]);
  return (
    <OptionPickerField
      value={value}
      onValueChange={onValueChange}
      options={options}
      placeholder="Todas las categorías"
      modalTitle="Filtrar por categoría"
      colors={colors}
      disabled={options.length === 0}
    />
  );
}
