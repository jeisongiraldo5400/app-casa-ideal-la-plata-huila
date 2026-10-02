import { useCallback } from 'react';
import type { WarehouseStockRow } from '../../utils/warehouseModel';
import { fetchWarehouseStock } from '../services/warehousesService';
import { useInfinitePages, type InfinitePagesState } from './useInfinitePages';

type Options = { warehouseId: string; search: string; enabled: boolean };

/** Productos de la bodega (`get_warehouse_stock`), con búsqueda y páginas que se suman. */
export function useWarehouseStock({ warehouseId, search, enabled }: Options): InfinitePagesState<WarehouseStockRow> {
  const fetchPage = useCallback(
    async (page: number) => {
      const result = await fetchWarehouseStock({ warehouseId, search, page });
      return { rows: result.rows, totalCount: result.totalCount };
    },
    [warehouseId, search]
  );
  return useInfinitePages({
    enabled: enabled && warehouseId !== '',
    queryKey: `${warehouseId}|${search}`,
    fetchPage,
    logContext: 'Bodegas: productos',
    errorFallback: 'No se pudieron cargar los productos de la bodega',
  });
}
