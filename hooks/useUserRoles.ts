import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';

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
          console.error('Error loading user roles:', userRolesError);
          setRoles([]);
          setLoading(false);
          return;
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
          console.error('Error loading roles:', rolesError);
          setRoles([]);
          setLoading(false);
          return;
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
      } catch (error) {
        console.error('Error loading user roles:', error);
        setRoles([]);
      } finally {
        setLoading(false);
      }
    };

    loadUserRoles();
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

  const canMarkOrderAsReceived = (): boolean => {
    return isAdmin() || isBodeguero();
  };

  return {
    roles,
    loading,
    hasRole,
    isAdmin,
    isBodeguero,
    canMarkOrderAsReceived,
  };
}

