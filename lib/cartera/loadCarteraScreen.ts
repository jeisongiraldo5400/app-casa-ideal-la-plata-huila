import { emptyCarteraDashboard } from '@/lib/offline/domain/carteraLocal';
import { fetchCarteraDashboardFromLocal } from '@/lib/offline/repositories/offlineRepository';
import {
  fetchCarteraDashboard,
  fetchCarteraPage,
  type CarteraDashboard,
  type CarteraFilter,
} from './carteraService';

export async function loadCarteraScreen(params: {
  filter: CarteraFilter;
  search: string;
  page: number;
  pageSize: number;
  days: number;
  municipioId: string;
  sellerId?: string;
  includeDashboard: boolean;
}): Promise<{
  rows: Awaited<ReturnType<typeof fetchCarteraPage>>['rows'];
  totalCount: number;
  fromCache: boolean;
  dashboard: CarteraDashboard | null;
}> {
  const list = await fetchCarteraPage(params);
  if (!params.includeDashboard) {
    return { ...list, dashboard: null };
  }

  try {
    const dashboard = await fetchCarteraDashboard(params.municipioId);
    return { ...list, dashboard };
  } catch {
    const local = await fetchCarteraDashboardFromLocal();
    return { ...list, dashboard: local ?? emptyCarteraDashboard() };
  }
}
