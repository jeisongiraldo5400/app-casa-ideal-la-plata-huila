import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';

export type SellerOption = { id: string; full_name: string };

/**
 * Usuarios de la plataforma que pueden figurar como vendedor de un negocio.
 * `profiles` es legible por cualquier usuario autenticado. Sin red devuelve
 * una lista vacía para que el llamador conserve al usuario actual como única
 * opción (los negocios no se crean offline).
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
    if (isNetworkError(error)) return [];
    throw error;
  }
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
