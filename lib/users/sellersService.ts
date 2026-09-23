import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchProfileNamesFromLocal,
} from '@/lib/offline/repositories/offlineRepository';

export type SellerOption = { id: string; full_name: string };

/**
 * Usuarios de la plataforma que pueden figurar como vendedor de un negocio.
 * `profiles` es legible por cualquier usuario autenticado.
 *
 * Sin red se responde con los perfiles descargados (el pull los trae desde
 * 20261122120000). Antes devolvía una lista vacía y eso dejaba mudos el filtro
 * de Clientes, los dos filtros de Cartera y la reasignación de vendedor.
 */
export async function fetchSellerOptions(): Promise<SellerOption[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .is('deleted_at', null)
      .order('full_name')
      .limit(200);
    if (error) throw new Error(error.message || 'No fue posible cargar los vendedores');
    return (data || []).map((profile) => ({
      id: profile.id,
      full_name: profile.full_name || profile.email || 'Sin nombre',
    }));
  } catch (error) {
    if (isNetworkError(error)) return fetchLocalSellerOptions();
    throw error;
  }
}

/** Perfiles guardados en el teléfono, en el mismo orden alfabético que el servidor. */
async function fetchLocalSellerOptions(): Promise<SellerOption[]> {
  if (!canUseLocalDb()) return [];
  const names = await fetchProfileNamesFromLocal();
  return [...names.entries()]
    .map(([id, full_name]) => ({ id, full_name }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Garantiza que el usuario actual esté en la lista (primero), aunque no haya red. */
export function withCurrentUserOption(
  options: SellerOption[],
  current: { id: string; name: string | null } | null
): SellerOption[] {
  if (!current?.id) return options;
  const rest = options.filter((option) => option.id !== current.id);
  const own = options.find((option) => option.id === current.id) || {
    id: current.id,
    full_name: current.name || 'Mi usuario',
  };
  return [own, ...rest];
}
