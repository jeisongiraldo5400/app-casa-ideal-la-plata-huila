import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/errorMessage';
import type { TransferDetail } from '../../utils/transferModel';
import { fetchTransferDetail } from '../services/transfersService';

/** Detalle de un traslado (`get_transfer_order_detail`), con recarga manual. */
export function useTransferDetail(transferOrderId: string | null) {
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(transferOrderId));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!transferOrderId) {
      setLoading(false);
      setError('No se indicó el traslado.');
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchTransferDetail(transferOrderId);
      if (id !== requestId.current) return;
      setDetail(result);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      // Se conserva lo último cargado: si solo se cayó la red, el conteo sigue a la vista.
      setError(errorMessage(err, 'No fue posible cargar el traslado'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [transferOrderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { detail, loading, error, reload };
}
