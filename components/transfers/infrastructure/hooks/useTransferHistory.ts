import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, logHandledError } from '@/lib/errorMessage';
import type { TransferSummary } from '../../utils/transferModel';
import {
  TRANSFER_HISTORY_PAGE_SIZE,
  historyFilter,
  type TransferHistoryFilterKey,
} from '../../utils/transferHistory';
import { fetchTransferOrdersPage } from '../services/transfersService';

type Options = {
  enabled: boolean;
  filter: TransferHistoryFilterKey;
  search: string;
  page: number;
};

export type TransferHistoryState = {
  rows: TransferSummary[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Historial de traslados (`list_transfer_orders_page`), con filtro de estado,
 * búsqueda y página. Una respuesta vieja nunca pisa a una nueva.
 */
export function useTransferHistory({ enabled, filter, search, page }: Options): TransferHistoryState {
  const [rows, setRows] = useState<TransferSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchTransferOrdersPage({
        statuses: historyFilter(filter).statuses,
        search,
        page,
        pageSize: TRANSFER_HISTORY_PAGE_SIZE,
      });
      if (id !== requestId.current) return;
      setRows(result.rows);
      setTotalCount(result.totalCount);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      logHandledError('Traslados: historial', caught);
      setError(errorMessage(caught, 'No se pudo cargar el historial de traslados'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filter, search, page]);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { rows, totalCount, loading, error, reload };
}
