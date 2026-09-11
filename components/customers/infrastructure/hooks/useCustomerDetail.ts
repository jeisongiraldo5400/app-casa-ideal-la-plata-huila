import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import type { CustomerSummary } from '@/lib/customers/customerSummary';
import { claimCustomer, fetchCustomerSummary } from '../services/customersDirectoryService';

/** Ficha de un cliente: resumen, negocios y la acción de reclamarlo. */
export function useCustomerDetail(customerId: string | null) {
  const { user } = useAuth();
  const { isVendedor } = useUserRoles();
  const online = useSyncStore((state) => state.online);

  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!customerId) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchCustomerSummary(customerId);
      if (id !== requestId.current) return;
      const { fromCache: cached, ...rest } = result;
      setSummary(rest);
      setFromCache(cached);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setSummary(null);
      setError(err instanceof Error ? err.message : 'No fue posible cargar el cliente');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reclamar = quedar como vendedor del cliente, y el trigger
  // `enforce_customer_seller` exige que ese usuario tenga rol de vendedor: un
  // admin sin ese rol vería el botón y el servidor lo rechazaría. Un usuario
  // puede acumular roles, así que se pregunta por presencia (admin+vendedor sí).
  const canClaim =
    Boolean(user?.id) &&
    isVendedor() &&
    Boolean(summary?.customer) &&
    !summary?.customer?.seller_id;

  const claim = useCallback(async () => {
    if (!customerId || !user?.id) return;
    try {
      setClaiming(true);
      await claimCustomer(customerId, user.id);
      await load();
    } finally {
      setClaiming(false);
    }
  }, [customerId, user?.id, load]);

  return {
    summary,
    loading,
    error,
    fromCache,
    canClaim,
    claimDisabled: !online,
    claiming,
    claim,
    reload: load,
  };
}
