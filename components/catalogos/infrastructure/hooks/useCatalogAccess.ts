import { useMemo } from 'react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { deriveCatalogAccess, type CatalogAccess } from '@/lib/catalogos/access';

export type CatalogAccessState = CatalogAccess & { loading: boolean };

/** Capacidades de catálogo derivadas de los roles del usuario (todos los roles de catálogo son equivalentes en móvil). */
export function useCatalogAccess(): CatalogAccessState {
  const { roles, loading } = useUserRoles();
  const access = useMemo(() => deriveCatalogAccess(roles.map((role) => role.role?.nombre ?? '')), [roles]);
  return { ...access, loading };
}
