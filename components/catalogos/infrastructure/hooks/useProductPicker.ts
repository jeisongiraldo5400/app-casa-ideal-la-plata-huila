import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { errorMessage } from '@/lib/errorMessage';
import { PICKER_PAGE_SIZE } from '@/lib/catalogos/constants';
import type { PublicCatalogCategory, PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import type { CatalogSection } from '@/lib/catalogos/types';
import { toggleCatalogProduct } from '../services/catalogItemsService';
import { getPrivateCatalog } from '../services/catalogsService';
import { listPublicCatalogCategories, listPublicCatalogProducts } from '../services/publicCatalogService';

const SEARCH_DEBOUNCE_MS = 300;

function selectedProductIds(sections: readonly CatalogSection[]): Set<string> {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (item.itemType === 'product') ids.add(item.referenceId);
    }
  }
  return ids;
}

export type ProductPickerState = {
  query: string;
  setQuery: (value: string) => void;
  categoryId: string;
  setCategoryId: (value: string) => void;
  categories: PublicCatalogCategory[];
  /** 0-based para `Pagination`; al RPC se le envía `page + 1`. */
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  items: PublicCatalogListingItem[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  selected: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  toggle: (item: PublicCatalogListingItem) => Promise<void>;
  reload: () => Promise<void>;
};

/**
 * Selector visual de fichas publicadas. Pagina en el servidor de 5 en 5 y
 * mantiene la selección en memoria con actualización optimista.
 */
export function useProductPicker(catalogId: string, initialSections: readonly CatalogSection[]): ProductPickerState {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryIdState] = useState('');
  const [categories, setCategories] = useState<PublicCatalogCategory[]>([]);
  const [page, setPageState] = useState(0);
  const [items, setItems] = useState<PublicCatalogListingItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => selectedProductIds(initialSections));
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const sectionsRef = useRef<CatalogSection[]>([...initialSections]);
  /** Serializa las escrituras de selección (ver el comentario en `toggle`). */
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    listPublicCatalogCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const reload = useCallback(async () => {
    const current = (requestId.current += 1);
    setLoading(true);
    setError(null);
    try {
      const result = await listPublicCatalogProducts({
        search: debouncedQuery,
        categoryId: categoryId || null,
        page: page + 1,
        pageSize: PICKER_PAGE_SIZE,
      });
      if (current !== requestId.current) return;
      setItems(result.items);
      setTotalCount(result.totalCount);
    } catch (caught) {
      if (current !== requestId.current) return;
      setError(errorMessage(caught, 'No se pudieron cargar las fichas'));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, categoryId, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setCategoryId = useCallback((value: string) => {
    setCategoryIdState(value);
    setPageState(0);
  }, []);

  const setQueryAndReset = useCallback((value: string) => {
    setQuery(value);
    setPageState(0);
  }, []);

  const toggle = useCallback(
    async (item: PublicCatalogListingItem) => {
      const productId = item.productId;
      if (pendingIds.has(productId)) return;
      const shouldAdd = !selected.has(productId);

      setPendingIds((current) => new Set(current).add(productId));
      setSelected((current) => {
        const next = new Set(current);
        if (shouldAdd) next.add(productId);
        else next.delete(productId);
        return next;
      });

      try {
        // Las escrituras se encadenan: si dos productos se tocan casi a la vez
        // y el catálogo aún no tiene capítulos, sin esta cola cada uno crearía
        // su propio capítulo «Selección».
        const run = async () => {
          const hadSections = sectionsRef.current.length > 0;
          await toggleCatalogProduct(catalogId, productId, shouldAdd, sectionsRef.current);
          if (shouldAdd && !hadSections) {
            // El primer capítulo se creó en la base: hay que conocer su id real
            // antes del siguiente toggle.
            const refreshed = await getPrivateCatalog(catalogId);
            if (refreshed) sectionsRef.current = refreshed.sections;
            return;
          }
          const [first, ...rest] = sectionsRef.current;
          if (!first) return;
          const nextItems = shouldAdd
            ? [
                ...first.items,
                { id: `local-${productId}`, itemType: 'product' as const, referenceId: productId, isFeatured: false, sortOrder: first.items.length },
              ]
            : first.items.filter((existing) => !(existing.itemType === 'product' && existing.referenceId === productId));
          sectionsRef.current = [
            { ...first, items: nextItems },
            ...rest.map((section) =>
              shouldAdd
                ? section
                : { ...section, items: section.items.filter((existing) => !(existing.itemType === 'product' && existing.referenceId === productId)) }
            ),
          ];
        };

        const queued = writeQueue.current.then(run, run);
        // La cola nunca queda rechazada: cada error lo maneja su propio toggle.
        writeQueue.current = queued.catch(() => undefined);
        await queued;
      } catch (caught) {
        setSelected((current) => {
          const next = new Set(current);
          if (shouldAdd) next.delete(productId);
          else next.add(productId);
          return next;
        });
        Alert.alert('No se pudo actualizar la selección', errorMessage(caught));
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(productId);
          return next;
        });
      }
    },
    [catalogId, pendingIds, selected]
  );

  const selectedView = useMemo<ReadonlySet<string>>(() => selected, [selected]);

  return {
    query,
    setQuery: setQueryAndReset,
    categoryId,
    setCategoryId,
    categories,
    page,
    setPage: setPageState,
    pageSize: PICKER_PAGE_SIZE,
    items,
    totalCount,
    loading,
    error,
    selected: selectedView,
    pendingIds,
    toggle,
    reload,
  };
}
