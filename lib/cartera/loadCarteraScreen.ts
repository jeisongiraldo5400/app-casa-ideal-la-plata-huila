import { emptyCarteraDashboard } from '@/lib/offline/domain/carteraLocal';
import { fetchCarteraDashboardFromLocal } from '@/lib/offline/repositories/offlineRepository';
import {
  fetchCarteraDashboard,
  fetchCarteraPage,
  markCuotasEnMora,
  type CarteraDashboard,
} from './carteraService';
import type { CarteraPageQuery } from './types';

/**
 * Una carga de la pantalla de Cartera.
 *
 * El orden importa en un solo punto: la mora se marca ANTES de leer, para que
 * el listado y el tablero vean las cuotas ya marcadas. Lo demás es
 * independiente y va a la vez: el listado (`get_cartera_cuotas`) y el tablero
 * (`get_cartera_management_dashboard`) no se esperan entre sí.
 *
 * `includeDashboard` distingue la carga completa de la pantalla de un «cargar
 * más»: paginar no vuelve a marcar la mora ni a pedir el tablero, porque es la
 * misma carga de pantalla.
 */
export async function loadCarteraScreen(params: CarteraPageQuery & {
  includeDashboard: boolean;
}): Promise<{
  rows: Awaited<ReturnType<typeof fetchCarteraPage>>['rows'];
  totalCount: number;
  fromCache: boolean;
  dashboard: CarteraDashboard | null;
}> {
  if (params.includeDashboard) await markCuotasEnMora();

  const list = fetchCarteraPage(params);
  const dashboard: Promise<CarteraDashboard | null> = params.includeDashboard
    ? fetchCarteraDashboard(params.municipioId).catch(async () => {
        const local = await fetchCarteraDashboardFromLocal();
        return local ?? emptyCarteraDashboard();
      })
    : Promise.resolve(null);

  // Promise.all ya escucha ambas promesas, así que un fallo del listado no deja
  // el tablero como rechazo sin capturar (y viceversa).
  const [listResult, dashboardResult] = await Promise.all([list, dashboard]);
  return { ...listResult, dashboard: dashboardResult };
}
