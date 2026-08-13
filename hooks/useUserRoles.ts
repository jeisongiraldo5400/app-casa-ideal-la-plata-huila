import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { getCachedRoles, setCachedRoles } from '@/lib/offline/security/secureKeys';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';

interface UserRole {
  id: string;
  role_id: string;
  role: {
    id: string;
    nombre: string;
  } | null;
}

/**
 * Hook para obtener y verificar los roles del usuario actual
 */
export function useUserRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    const loadUserRoles = async () => {
      try {
        // Primero obtener los user_roles
        const { data: userRolesData, error: userRolesError } = await supabase
          .from('user_roles')
          .select('id, role_id')
          .eq('user_id', user.id);

        if (userRolesError) {
          throw userRolesError;
        }

        if (!userRolesData || userRolesData.length === 0) {
          setRoles([]);
          setLoading(false);
          return;
        }

        // Obtener los detalles de los roles
        const roleIds = userRolesData.map((ur) => ur.role_id);
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('id, nombre')
          .in('id', roleIds)
          .is('deleted_at', null);

        if (rolesError) {
          throw rolesError;
        }

        // Combinar user_roles con roles
        const transformedRoles: UserRole[] = userRolesData.map((userRole) => {
          const role = rolesData?.find((r) => r.id === userRole.role_id);
          return {
            id: userRole.id,
            role_id: userRole.role_id,
            role: role ? { id: role.id, nombre: role.nombre } : null,
          };
        });

        setRoles(transformedRoles);
        await setCachedRoles({ userId: user.id, roles: transformedRoles });
      } catch (error) {
        console.error('Error loading user roles:', error);
        const cached = await getCachedRoles();
        if (cached?.userId === user.id) {
          setRoles(cached.roles);
        } else if (!isNetworkError(error)) {
          setRoles([]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadUserRoles();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadUserRoles();
    });
    const rolesChannel = supabase
      .channel(`user-roles-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        () => void loadUserRoles()
      )
      .subscribe();

    return () => {
      appStateSubscription.remove();
      void supabase.removeChannel(rolesChannel);
    };
  }, [user]);

  const hasRole = (roleName: string): boolean => {
    return roles.some((userRole) => 
      userRole.role?.nombre?.toLowerCase() === roleName.toLowerCase()
    );
  };

  const isAdmin = (): boolean => {
    return hasRole('admin');
  };

  const isBodeguero = (): boolean => {
    return hasRole('bodeguero');
  };

  const isVendedor = (): boolean => {
    return hasRole('vendedor');
  };

  const isGestorCobro = (): boolean => {
    return hasRole('gestor de cobro');
  };

  const canMarkOrderAsReceived = (): boolean => {
    return isAdmin() || isBodeguero();
  };

  /** Modo vendedor: prioriza ventas si es vendedor y no bodeguero (admin ve ambos). */
  const preferSellerWorkspace = (): boolean => {
    if (isAdmin()) return false;
    return isVendedor() && !isBodeguero();
  };

  return {
    roles,
    loading,
    hasRole,
    isAdmin,
    isBodeguero,
    isVendedor,
    isGestorCobro,
    canMarkOrderAsReceived,
    preferSellerWorkspace,
  };
}
