import { SearchField } from '@/components/ui';
import { useInventoryStore } from '@/components/inventory/infrastructure/store/inventoryStore';
import React from 'react';

/** Espera a que el usuario deje de escribir antes de consultar al servidor. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Buscador del listado de productos.
 *
 * El texto vive AQUÍ, no en el store: antes cada tecla escribía en el store, y
 * como la pantalla está suscrita a él, se volvía a pintar la lista entera en
 * cada letra. Se sentía como que «no deja escribir» y el texto parecía
 * borrarse. Ahora la pantalla solo se entera cuando el usuario hace una pausa.
 *
 * Se suscribe a `setSearchQuery` con selector, para no repintarse cuando cambia
 * cualquier otra cosa del store (la lista, el cargando…).
 */
export function SearchBar() {
  const setSearchQuery = useInventoryStore((state) => state.setSearchQuery);
  const storeQuery = useInventoryStore((state) => state.searchQuery);
  const [text, setText] = React.useState(storeQuery);

  // Si el término del store cambia por fuera (p. ej. al limpiar filtros), el
  // campo lo sigue; mientras el usuario escribe, manda lo que él escribió.
  React.useEffect(() => {
    setText((current) => (current === storeQuery ? current : storeQuery));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeQuery]);

  React.useEffect(() => {
    if (text === storeQuery) return;
    const timer = setTimeout(() => setSearchQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, storeQuery, setSearchQuery]);

  return (
    <SearchField
      value={text}
      onChangeText={setText}
      placeholder="Buscar por nombre, SKU o código"
      returnKeyType="search"
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}
