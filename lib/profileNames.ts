import { supabase } from '@/lib/supabase';

/**
 * Nombres visibles de usuarios por id (perfil). Misma convención que los RPC
 * del servidor: nombre completo, si no el correo, si no "Sistema".
 */
export async function fetchProfileNames(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
  if (error) throw error;
  for (const row of data || []) {
    names.set(row.id, row.full_name || row.email || 'Sistema');
  }
  return names;
}

export function displayProfileName(names: Map<string, string>, userId: string | null | undefined) {
  if (!userId) return 'Sistema';
  return names.get(userId) || 'Sistema';
}
