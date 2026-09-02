import { supabase } from '@/lib/supabase';

export const UNAUTHORIZED_EXIT_MESSAGE =
  'No estás autorizado para registrar la salida de inventario de esta orden.';

export type ExitAuthorizationResult = {
  canRegister: boolean;
  message: string | null;
};

const DENIED: ExitAuthorizationResult = { canRegister: false, message: UNAUTHORIZED_EXIT_MESSAGE };

/**
 * Bodegueros y admins siempre pueden registrar; el resto solo si la orden tiene
 * asignaciones explícitas y el usuario está entre ellas. El RPC vuelve a exigirlo en BD.
 */
export async function checkExitAuthorization(orderId: string): Promise<ExitAuthorizationResult> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return DENIED;

    const { data: assignments, error: assignmentsError } = await supabase
      .from('delivery_order_pickup_assignments')
      .select('user_id')
      .eq('delivery_order_id', orderId)
      .is('deleted_at', null);
    if (assignmentsError) {
      console.error('Error loading pickup assignments:', assignmentsError);
      return DENIED;
    }

    const { data: userRolesData, error: userRolesError } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id);
    if (userRolesError) {
      console.error('Error loading user roles:', userRolesError);
      return DENIED;
    }

    const roleIds = (userRolesData || []).map((role) => role.role_id);
    if (roleIds.length > 0) {
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('nombre')
        .in('id', roleIds)
        .is('deleted_at', null);
      if (rolesError) {
        console.error('Error loading role names:', rolesError);
        return DENIED;
      }
      const isDefaultAuthorized = (rolesData || []).some((role) =>
        ['bodeguero', 'admin'].includes((role.nombre || '').toLowerCase())
      );
      if (isDefaultAuthorized) return { canRegister: true, message: null };
    }

    const hasAssignments = (assignments || []).length > 0;
    if (!hasAssignments) return DENIED;

    const isAssignedUser = (assignments || []).some((assignment) => assignment.user_id === user.id);
    return { canRegister: isAssignedUser, message: isAssignedUser ? null : UNAUTHORIZED_EXIT_MESSAGE };
  } catch (error) {
    console.error('Error validating exit authorization:', error);
    return DENIED;
  }
}
