import { errorMessage } from '@/lib/errorMessage';
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';

export interface DashboardStats {
  /**
   * `null` = no se pudo consultar. Antes estos campos eran `number` y un fallo
   * del RPC se pintaba como «0 pendientes»: en ruta, sin señal, el usuario leía
   * un cero inventado y daba por hecho que no tenía nada por despachar.
   */
  entriesToday: number | null;
  exitsToday: number | null;
  pendingOrders: number | null;
  pendingDeliveryOrders: number | null;
  loading: boolean;
  /** Mensaje en español cuando alguna consulta falló; `null` si todo llegó. */
  error: string | null;
}

const DASHBOARD_CHANNEL = 'dashboard-inventory-stats';

/** Respuesta mínima de `supabase.rpc` que necesitan los indicadores. */
type DashboardRpcResult = {
  data: Record<string, unknown>[] | null;
  error: { message?: string; code?: string } | null;
};

/** Valor de la primera fila; `null` cuando esa consulta no llegó al servidor. */
function readCount(result: DashboardRpcResult, field: string): number | null {
  if (result.error) return null;
  const value = result.data?.[0]?.[field];
  return typeof value === 'number' ? value : 0;
}

/**
 * Arma los indicadores del inicio a partir de las tres consultas. Cada tarjeta
 * es independiente: si solo una falla, las otras siguen mostrando su número.
 */
export function buildDashboardStats(
  statsResult: DashboardRpcResult,
  purchaseOrdersResult: DashboardRpcResult,
  deliveryOrdersResult: DashboardRpcResult
): Omit<DashboardStats, 'loading'> {
  const failure = [statsResult, purchaseOrdersResult, deliveryOrdersResult].find((result) => result.error);
  return {
    entriesToday: readCount(statsResult, 'entries_quantity_today'),
    exitsToday: readCount(statsResult, 'exits_quantity_today'),
    pendingOrders: readCount(purchaseOrdersResult, 'pending'),
    pendingDeliveryOrders: readCount(deliveryOrdersResult, 'pending_orders'),
    error: failure ? errorMessage(failure.error, 'No se pudo consultar el resumen') : null,
  };
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    entriesToday: null,
    exitsToday: null,
    pendingOrders: null,
    pendingDeliveryOrders: null,
    loading: true,
    error: null,
  });

  const loadStats = useCallback(async () => {
    try {
      const [statsResult, purchaseOrdersResult, deliveryOrdersResult] = await Promise.all([
        supabase.rpc('get_reports_stats_today'),
        supabase.rpc('get_purchase_orders_stats'),
        supabase.rpc('get_delivery_orders_stats'),
      ]);

      const next = buildDashboardStats(
        statsResult as DashboardRpcResult,
        purchaseOrdersResult as DashboardRpcResult,
        deliveryOrdersResult as DashboardRpcResult
      );
      if (next.error) console.warn('No se pudieron actualizar todos los indicadores del inicio');
      setStats({ ...next, loading: false });
    } catch (error) {
      // Sin red la promesa se rechaza: ninguna tarjeta tiene dato que mostrar.
      setStats({
        entriesToday: null,
        exitsToday: null,
        pendingOrders: null,
        pendingDeliveryOrders: null,
        loading: false,
        error: errorMessage(error, 'No se pudo consultar el resumen'),
      });
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    void loadStats();

    const refreshAfterChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isActive) void loadStats();
      }, 800);
    };

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic === `realtime:${DASHBOARD_CHANNEL}`) {
        void supabase.removeChannel(existingChannel);
      }
    }

    const inventoryChannel = supabase
      .channel(DASHBOARD_CHANNEL)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_entries' }, refreshAfterChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_exits' }, refreshAfterChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_entry_cancellations' }, refreshAfterChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_exit_cancellations' }, refreshAfterChange)
      .subscribe((status, error) => {
        if (!isActive || status === 'SUBSCRIBED' || status === 'CLOSED') return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('La sincronización en tiempo real no está disponible; se usarán actualizaciones periódicas.', error?.message || status);
        }
      });

    const backupPolling = setInterval(() => {
      if (isActive) void loadStats();
    }, 60000);

    return () => {
      isActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(backupPolling);
      void supabase.removeChannel(inventoryChannel);
    };
  }, [loadStats]);

  // `reload` permite que la pantalla ofrezca «Reintentar» cuando la carga falla.
  return { ...stats, reload: loadStats };
}
