import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

export type AllOrdersTab = 'purchase' | 'delivery';

type AllOrdersParams = { tab?: string; q?: string; n?: string };

const tabOf = (value: string | undefined): AllOrdersTab => (value === 'purchase' ? 'purchase' : 'delivery');

/**
 * Pestaña y buscador de «Todas las órdenes», sincronizados con la ruta.
 *
 * Una notificación abre `/(tabs)/all-orders?tab=…&q=<número>&n=<aviso>`. La
 * pestaña conserva su estado, así que tomar los parámetros solo como estado
 * inicial dejaba la lista en la orden anterior al tocar un segundo aviso. Como
 * en Cartera, se reaplican cada vez que cambian; `n` distingue dos toques con
 * el mismo número.
 */
export function useAllOrdersRouteState() {
  const params = useLocalSearchParams<AllOrdersParams>();
  const [activeTab, setActiveTab] = useState<AllOrdersTab>(tabOf(params.tab));
  const [searchQuery, setSearchQuery] = useState(params.q ?? '');

  useEffect(() => {
    // Sin parámetros (se abrió desde Inicio) no se toca lo que el usuario tenga.
    if (params.tab === undefined && params.q === undefined) return;
    setActiveTab(tabOf(params.tab));
    setSearchQuery(params.q ?? '');
  }, [params.tab, params.q, params.n]);

  return { activeTab, setActiveTab, searchQuery, setSearchQuery };
}
