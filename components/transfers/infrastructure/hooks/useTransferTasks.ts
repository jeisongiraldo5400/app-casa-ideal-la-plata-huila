import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { canUseTransfersFor } from '@/lib/auth/warehouseAccess';
import { errorMessage, logHandledError } from '@/lib/errorMessage';
import type { TransferTasks, WarehouseMembership } from '../../utils/transferModel';
import { countTasks } from '../../utils/transferTasks';
import {
  fetchMyTransferTasks,
  fetchMyWarehouseMemberships,
  isTransfersUnavailableError,
} from '../services/transfersService';

type Options = {
  /** Solo consulta con la pantalla a la vista y con señal. */
  enabled: boolean;
};

export type TransferTasksState = {
  tasks: TransferTasks | null;
  memberships: WarehouseMembership[];
  loading: boolean;
  error: string | null;
  /** El servidor aún no tiene las RPC de traslados (migración sin aplicar). */
  unavailable: boolean;
  /** ¿Puede entrar al módulo? (rol, bodega o tareas; ver `canUseTransfersFor`). */
  canUse: boolean;
  rolesLoading: boolean;
  reload: () => Promise<void>;
};

/**
 * Tareas de traslado del usuario (`get_my_transfer_tasks`) y sus bodegas
 * (`get_my_warehouse_memberships`). Dos consultas en paralelo, sin caché
 * propia: la lista y la tarjeta de Inicio se refrescan al volver a la vista.
 */
export function useTransferTasks({ enabled }: Options): TransferTasksState {
  const { roles, loading: rolesLoading } = useUserRoles();
  const [tasks, setTasks] = useState<TransferTasks | null>(null);
  const [memberships, setMemberships] = useState<WarehouseMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const [tasksResult, membershipsResult] = await Promise.allSettled([
      fetchMyTransferTasks(),
      fetchMyWarehouseMemberships(),
    ]);
    if (id !== requestId.current) return;
    if (tasksResult.status === 'fulfilled') {
      setTasks(tasksResult.value);
      setError(null);
      setUnavailable(false);
    } else {
      const missing = isTransfersUnavailableError(tasksResult.reason);
      setUnavailable(missing);
      if (!missing) logHandledError('Traslados: tareas', tasksResult.reason);
      setError(missing ? null : errorMessage(tasksResult.reason, 'No fue posible consultar los traslados'));
    }
    if (membershipsResult.status === 'fulfilled') setMemberships(membershipsResult.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const roleNames = useMemo(() => roles.map((userRole) => userRole.role?.nombre ?? ''), [roles]);
  const canUse =
    !unavailable &&
    canUseTransfersFor({
      roleNames,
      membershipsCount: memberships.length,
      tasksCount: tasks ? countTasks(tasks) : 0,
    });

  return { tasks, memberships, loading, error, unavailable, canUse, rolesLoading, reload };
}
