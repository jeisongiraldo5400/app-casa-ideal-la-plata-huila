import { useExitsListStore } from '@/components/exits-list/infrastructure/store/exitsListStore';
import { SearchField } from '@/components/ui';
import React, { useEffect, useRef, useState } from 'react';

/** Espera tras la última tecla antes de consultar al servidor. */
export const EXITS_SEARCH_DEBOUNCE_MS = 400;

export function ExitsSearchBar() {
  const searchQuery = useExitsListStore((state) => state.searchQuery);
  const searchExits = useExitsListStore((state) => state.searchExits);
  const [text, setText] = useState(searchQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onChangeText = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // Limpiar la búsqueda (botón ×) recarga de inmediato.
    if (!value.trim()) {
      void searchExits('');
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      void searchExits(value.trim());
    }, EXITS_SEARCH_DEBOUNCE_MS);
  };

  const submit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void searchExits(text.trim());
  };

  return (
    <SearchField
      value={text}
      onChangeText={onChangeText}
      onSubmitEditing={submit}
      placeholder="Buscar producto, SKU, código o serial"
      returnKeyType="search"
      autoCapitalize="none"
    />
  );
}
