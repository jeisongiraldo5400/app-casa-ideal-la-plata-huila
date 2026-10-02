import { useCallback, useEffect, useRef, useState } from 'react';
import { logHandledError } from '@/lib/errorMessage';
import type { MyWarehouses } from '../../utils/warehouseModel';
import { fetchMyWarehouses, isWarehousesUnavailableError, warehouseErrorMessage } from '../services/warehousesService';

type Options = {
  /** Solo consulta con la pantalla a la vista y con señal. */
  enabled: boolean;
};

export type MyWarehousesState = {
  data: MyWarehouses | null;
  loading: boolean;
  error: string | null;
  /** El servidor aún no tiene `list_my_warehouses` (migración sin aplicar). */
  unavailable: boolean;
  reload: () => Promise<void>;
};

/**
 * Bodegas que ve el usuario (`list_my_warehouses`): admin todas, los demás
 * aquellas de las que son Responsables. Sin caché propia: la lista se
 * refresca al volver a la vista.
 */
export function useMyWarehouses({ enabled }: Options): MyWarehousesState {
  const [data, setData] = useState<MyWarehouses | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchMyWarehouses();
      if (id !== requestId.current) return;
      setData(result);
      setError(null);
      setUnavailable(false);
    } catch (caught) {
      if (id !== requestId.current) return;
      const missing = isWarehousesUnavailableError(caught);
      setUnavailable(missing);
      if (!missing) logHandledError('Bodegas: lista', caught);
      setError(missing ? null : warehouseErrorMessage(caught, 'No fue posible consultar las bodegas'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { data, loading, error, unavailable, reload };
}
