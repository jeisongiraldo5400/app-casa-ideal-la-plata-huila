import { useEffect, useMemo } from 'react';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import {
  retainSaleWarehousesWatchers,
  useSaleWarehousesStore,
} from '@/lib/auth/saleWarehousesStore';
import {
  UNRESTRICTED_SALE_ACCESS,
  type SaleWarehouseAccess,
} from '@/components/negocios/domain/saleWarehouses';

const NO_IDS: readonly string[] = [];

/**
 * Bodegas de las que el usuario actual puede vender al crear un negocio
 * «desde bodega».
 *
 * - `restricted`: false para el admin (por rol local o por el servidor).
 * - `allowedIds`: bodegas permitidas; vacío si no tiene o si aún no se sabe.
 * - `loaded`: ya hay respuesta del servidor o de la caché. Sin ella la
 *   pantalla no muestra bodegas (falla cerrado).
 * - `access`: lo que se pasa a servicios y store.
 */
export function useSaleWarehouses() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { isAdmin } = useUserRoles();

  const setUser = useSaleWarehousesStore((state) => state.setUser);
  const serverAdmin = useSaleWarehousesStore((state) => state.isAdmin);
  const warehouseIds = useSaleWarehousesStore((state) => state.warehouseIds);
  const source = useSaleWarehousesStore((state) => state.source);
  const loading = useSaleWarehousesStore((state) => state.loading);
  const error = useSaleWarehousesStore((state) => state.error);
  const refresh = useSaleWarehousesStore((state) => state.refresh);

  useEffect(() => {
    setUser(userId);
  }, [setUser, userId]);

  useEffect(() => retainSaleWarehousesWatchers(), []);

  const admin = isAdmin() || serverAdmin;
  const loaded = admin || source !== 'none';
  const restricted = !admin;
  const allowedIds = restricted && loaded ? warehouseIds : NO_IDS;

  const access = useMemo<SaleWarehouseAccess>(
    () => (restricted ? { restricted: true, allowedIds } : UNRESTRICTED_SALE_ACCESS),
    [restricted, allowedIds]
  );

  return { restricted, allowedIds, loaded, loading, error, refresh, access };
}

/**
 * Arranca la carga al iniciar sesión y la refresca al volver la app al frente,
 * sin suscribirse a los valores (no repinta a quien lo monta). Así la caché
 * queda lista para crear negocios sin señal aunque no se haya abierto esa
 * pantalla con red.
 */
export function useSaleWarehousesBootstrap() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const setUser = useSaleWarehousesStore((state) => state.setUser);

  useEffect(() => {
    setUser(userId);
  }, [setUser, userId]);

  useEffect(() => retainSaleWarehousesWatchers(), []);
}
