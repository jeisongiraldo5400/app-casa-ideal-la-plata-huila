import { SearchField } from '@/components/ui';
import { useInventory } from '@/components/inventory/infrastructure/hooks/useInventory';
import React from 'react';

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useInventory();
  return (
    <SearchField
      value={searchQuery}
      onChangeText={setSearchQuery}
      placeholder="Buscar nombre, SKU, código o bodega"
      returnKeyType="search"
      autoCapitalize="none"
    />
  );
}
