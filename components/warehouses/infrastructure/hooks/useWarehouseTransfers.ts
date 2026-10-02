import { useCallback, useEffect, useRef, useState } from 'react';
import { logHandledError } from '@/lib/errorMessage';
import {
  fetchWarehouseTransfers,
  warehouseErrorMessage,
  type WarehouseTransfers,
} from '../services/warehousesService';

type Options = { warehouseId: string; enabled: boolean };

export type WarehouseTransfersState = {
  data: WarehouseTransfers | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/** Traslados en camino hacia la bodega y por despachar desde ella. */
export function useWarehouseTransfers({ warehouseId, enabled }: Options): WarehouseTransfersState {
  const [data, setData] = useState<WarehouseTransfers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!warehouseId) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchWarehouseTransfers(warehouseId);
      if (id !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      logHandledError('Bodegas: traslados', caught);
      setError(warehouseErrorMessage(caught, 'No se pudieron cargar los traslados de la bodega'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { data, loading, error, reload };
}
