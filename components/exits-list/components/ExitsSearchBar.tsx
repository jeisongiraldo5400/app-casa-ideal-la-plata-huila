import { useExitsList } from '@/components/exits-list/infrastructure/hooks/useExitsList';
import { SearchField } from '@/components/ui';
import React from 'react';

export function ExitsSearchBar() {
  const { searchQuery, setSearchQuery } = useExitsList();
  return (
    <SearchField
      value={searchQuery}
      onChangeText={setSearchQuery}
      placeholder="Buscar producto, SKU o código"
      returnKeyType="search"
      autoCapitalize="none"
    />
  );
}
