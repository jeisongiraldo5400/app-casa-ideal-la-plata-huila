import { useMemo } from 'react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { warehouseAccessFor, type WarehouseAccess } from '@/lib/auth/warehouseAccess';

/** Accesos de almacén del usuario actual (ver `lib/auth/warehouseAccess`). */
export function useWarehouseAccess(): WarehouseAccess & { rolesLoading: boolean } {
  const { roles, loading } = useUserRoles();
  return useMemo(
    () => ({
      ...warehouseAccessFor(roles.map((userRole) => userRole.role?.nombre ?? '')),
      rolesLoading: loading,
    }),
    [loading, roles]
  );
}
