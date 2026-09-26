import { errorMessage } from '@/lib/errorMessage';
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export interface DashboardStats {
  /**
   * `null` = no se pudo consultar (o no aplica al rol). Antes estos campos eran
   * `number` y un fallo del RPC se pintaba como «0 pendientes»: en ruta, sin
   * señal, el usuario leía un cero inventado y daba por hecho que no tenía nada
   * por despachar.
   */
  pendingOrders: number | null;
  pendingDeliveryOrders: number | null;
  loading: boolean;
  /** Mensaje en español cuando alguna consulta falló; `null` si todo llegó. */
  error: string | null;
}

/**
 * Cada cuánto se refrescan los pendientes con Inicio a la vista. Antes eran
 * 60 s más un canal de tiempo real que recargaba tres RPC por cada entrada o
 * salida de cualquier bodega, aun sin señal o con la app en segundo plano.
 */
export const DASHBOARD_REFRESH_MS = 5 * 60_000;
/** Al volver a Inicio o a la app no se reconsulta si lo último tiene menos de esto. */
export const DASHBOARD_MIN_REFRESH_GAP_MS = 30_000;

/** Respuesta mínima de `supabase.rpc` que necesitan los indicadores. */
type DashboardRpcResult = {
  data: Record<string, unknown>[] | null;
  error: { message?: string; code?: string } | null;
};

/** Valor de la primera fila; `null` cuando esa consulta no llegó al servidor. */
function readCount(result: DashboardRpcResult | null, field: string): number | null {
  if (!result || result.error) return null;
  const value = result.data?.[0]?.[field];
  return typeof value === 'number' ? value : 0;
}

/**
 * Arma los indicadores del inicio. Cada tarjeta es independiente: si solo una
 * falla, la otra sigue mostrando su número. `purchaseOrdersResult` es `null`
 * cuando el rol no puede ver órdenes de compra y no se consultó.
 */
export function buildDashboardStats(
  purchaseOrdersResult: DashboardRpcResult | null,
  deliveryOrdersResult: DashboardRpcResult
): Omit<DashboardStats, 'loading'> {
  const failure = [purchaseOrdersResult, deliveryOrdersResult].find((result) => result?.error);
  return {
    pendingOrders: readCount(purchaseOrdersResult, 'pending'),
    pendingDeliveryOrders: readCount(deliveryOrdersResult, 'pending_orders'),
    error: failure?.error ? errorMessage(failure.error, 'No se pudo consultar el resumen') : null,
  };
}

export type DashboardStatsOptions = {
  /** Consultar órdenes de compra (solo admin y bodeguero pueden leerlas). */
  includePurchaseOrders: boolean;
  /** Inicio está a la vista; con la pestaña oculta no se consulta. */
  focused: boolean;
  /** Hay red; sin ella no se consulta y se conservan los últimos números. */
  online: boolean;
};

export function useDashboardStats({ includePurchaseOrders, focused, online }: DashboardStatsOptions) {
  const [stats, setStats] = useState<DashboardStats>({
    pendingOrders: null,
    pendingDeliveryOrders: null,
    loading: true,
    error: null,
  });
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const lastLoadAt = useRef(0);
  /** Con qué alcance se consultó por última vez (los roles llegan después del primer render). */
  const lastIncludedPurchaseOrders = useRef<boolean | null>(null);
  /** Descarta respuestas viejas si se lanzó otra consulta mientras tanto. */
  const loadId = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  const loadStats = useCallback(async () => {
    const id = ++loadId.current;
    lastLoadAt.current = Date.now();
    lastIncludedPurchaseOrders.current = includePurchaseOrders;
    setStats((previous) => ({ ...previous, loading: true }));
    try {
      const [purchaseOrdersResult, deliveryOrdersResult] = await Promise.all([
        includePurchaseOrders ? supabase.rpc('get_purchase_orders_stats') : Promise.resolve(null),
        supabase.rpc('get_delivery_orders_stats'),
      ]);

      const next = buildDashboardStats(
        purchaseOrdersResult as DashboardRpcResult | null,
        deliveryOrdersResult as DashboardRpcResult
      );
      if (id !== loadId.current) return;
      if (next.error) console.warn('No se pudieron actualizar todos los indicadores del inicio');
      setStats({ ...next, loading: false });
    } catch (error) {
      if (id !== loadId.current) return;
      // Sin red la promesa se rechaza: ninguna tarjeta tiene dato que mostrar.
      setStats({
        pendingOrders: null,
        pendingDeliveryOrders: null,
        loading: false,
        error: errorMessage(error, 'No se pudo consultar el resumen'),
      });
    }
  }, [includePurchaseOrders]);

  const active = focused && online && appActive;

  useEffect(() => {
    if (!active) {
      // Sin consultar no hay nada cargando: se conservan los últimos números.
      setStats((previous) => (previous.loading ? { ...previous, loading: false } : previous));
      return;
    }
    const stale = Date.now() - lastLoadAt.current >= DASHBOARD_MIN_REFRESH_GAP_MS;
    if (stale || lastIncludedPurchaseOrders.current !== includePurchaseOrders) void loadStats();
    const timer = setInterval(() => void loadStats(), DASHBOARD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, includePurchaseOrders, loadStats]);

  // `reload` permite que la pantalla ofrezca «Reintentar» cuando la carga falla.
  return { ...stats, reload: loadStats };
}
