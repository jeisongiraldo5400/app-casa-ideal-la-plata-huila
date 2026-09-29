import { useCallback, useState } from 'react';
import { QUICK_SHARE_MAX_PRODUCTS, toggleProductSelection } from '@/lib/catalogos/quickShare';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';

export type ProductSelection = {
  selected: PublicCatalogListingItem[];
  max: number;
  /** El último intento de añadir chocó con el tope. */
  limitReached: boolean;
  isSelected: (productId: string) => boolean;
  toggle: (item: PublicCatalogListingItem) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

/**
 * Selección de «Enviar productos». Guarda las fichas elegidas (no la página
 * ni la búsqueda), así que se conserva al paginar y al buscar otra cosa.
 */
export function useProductSelection(max: number = QUICK_SHARE_MAX_PRODUCTS): ProductSelection {
  const [selected, setSelected] = useState<PublicCatalogListingItem[]>([]);
  const [limitReached, setLimitReached] = useState(false);

  const toggle = useCallback(
    (item: PublicCatalogListingItem) => {
      const result = toggleProductSelection(selected, item, max);
      setLimitReached(result.limitReached);
      if (!result.limitReached) setSelected(result.selection);
    },
    [selected, max]
  );

  const remove = useCallback((productId: string) => {
    setLimitReached(false);
    setSelected((current) => current.filter((entry) => entry.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setLimitReached(false);
    setSelected([]);
  }, []);

  const isSelected = useCallback((productId: string) => selected.some((entry) => entry.productId === productId), [selected]);

  return { selected, max, limitReached, isSelected, toggle, remove, clear };
}
