import { useCallback, useEffect } from 'react';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { hasCatalogRole } from '@/lib/catalogos/access';
import {
  retainUserRolesWatchers,
  useUserRolesStore,
  type UserRole,
} from '@/lib/auth/userRolesStore';

export type { UserRole };

/**
 * Roles del usuario actual.
 *
 * La interfaz pública no cambió, pero por dentro ya no consulta: lee del store
 * compartido (`lib/auth/userRolesStore`), que hace UNA sola consulta por carga
 * aunque el hook esté montado en diez pantallas a la vez.
 */
export function useUserRoles() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const roles = useUserRolesStore((state) => state.roles);
  const loading = useUserRolesStore((state) => state.loading);
  const setUser = useUserRolesStore((state) => state.setUser);

  useEffect(() => {
    setUser(userId);
  }, [setUser, userId]);

  // El primer consumidor abre el canal de realtime y el listener de AppState;
  // el último los cierra. No se duplican por pantalla.
  useEffect(() => retainUserRolesWatchers(), []);

  // Los ayudantes se memorizan contra `roles`: varias pantallas los usan como
  // dependencia de efectos y con una identidad nueva por render se relanzaban.
  const hasRole = useCallback(
    (roleName: string): boolean =>
      roles.some((userRole) => userRole.role?.nombre?.toLowerCase() === roleName.toLowerCase()),
    [roles]
  );

  const isAdmin = useCallback((): boolean => hasRole('admin'), [hasRole]);
  const isBodeguero = useCallback((): boolean => hasRole('bodeguero'), [hasRole]);
  const isVendedor = useCallback((): boolean => hasRole('vendedor'), [hasRole]);
  const isGestorCobro = useCallback((): boolean => hasRole('gestor de cobro'), [hasRole]);

  /** Cobra en todos los negocios sin tenerlos asignados (20261113120000). */
  const isRecaudador = useCallback((): boolean => hasRole('recaudador'), [hasRole]);

  /**
   * Solo puede llegar a un negocio buscándolo: no ve listados de cartera ni de
   * negocios. Es el caso del recaudador «puro» (20261125120000): cobra en
   * cualquier negocio, pero no recorre la cartera ajena. Si además tiene otro
   * rol que sí da esa vista, manda ese otro rol.
   */
  const onlyFindsBySearch = useCallback(
    (): boolean => isRecaudador() && !isAdmin() && !isGestorCobro() && !isVendedor(),
    [isAdmin, isGestorCobro, isRecaudador, isVendedor]
  );

  /** Módulo de catálogos: admin, catalog_admin, catalog_editor o catalog_seller. */
  const canAccessCatalogs = useCallback(
    (): boolean => hasCatalogRole(roles.map((userRole) => userRole.role?.nombre ?? '')),
    [roles]
  );

  const canMarkOrderAsReceived = useCallback(
    (): boolean => isAdmin() || isBodeguero(),
    [isAdmin, isBodeguero]
  );

  /** Modo vendedor: prioriza ventas si es vendedor y no bodeguero (admin ve ambos). */
  const preferSellerWorkspace = useCallback((): boolean => {
    if (isAdmin()) return false;
    return isVendedor() && !isBodeguero();
  }, [isAdmin, isBodeguero, isVendedor]);

  return {
    roles,
    loading,
    hasRole,
    isAdmin,
    isBodeguero,
    isVendedor,
    isGestorCobro,
    isRecaudador,
    onlyFindsBySearch,
    canAccessCatalogs,
    canMarkOrderAsReceived,
    preferSellerWorkspace,
  };
}
