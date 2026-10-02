import { useCallback, useMemo } from 'react';
import {
  historyDateRange,
  movementTypesFor,
  type HistoryDatePreset,
  type HistoryTypeFilter,
} from '../../utils/warehouseHistory';
import type { WarehouseHistoryRow } from '../../utils/warehouseModel';
import { fetchWarehouseHistory } from '../services/warehousesService';
import { useInfinitePages, type InfinitePagesState } from './useInfinitePages';

type Options = {
  warehouseId: string;
  typeFilter: HistoryTypeFilter;
  datePreset: HistoryDatePreset;
  enabled: boolean;
};

/** Movimientos de la bodega (`get_warehouse_history`), del más reciente al más viejo. */
export function useWarehouseHistory({
  warehouseId,
  typeFilter,
  datePreset,
  enabled,
}: Options): InfinitePagesState<WarehouseHistoryRow> {
  // El rango se fija al elegir el filtro (no se recalcula en cada render).
  const range = useMemo(() => historyDateRange(datePreset), [datePreset]);
  const fetchPage = useCallback(
    async (page: number) => {
      const result = await fetchWarehouseHistory({
        warehouseId,
        movementTypes: movementTypesFor(typeFilter),
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        page,
      });
      return { rows: result.rows, totalCount: result.totalCount };
    },
    [warehouseId, typeFilter, range]
  );
  return useInfinitePages({
    enabled: enabled && warehouseId !== '',
    queryKey: `${warehouseId}|${typeFilter}|${range.dateFrom ?? ''}|${range.dateTo ?? ''}`,
    fetchPage,
    logContext: 'Bodegas: historial',
    errorFallback: 'No se pudo cargar el historial de la bodega',
  });
}
