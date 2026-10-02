/**
 * Acceso a las RPC de bodegas por encargado (migración 20261231390000):
 * admin ve todas; cualquier otro, solo las bodegas de las que es Responsable
 * (`warehouse_members`). El servidor decide: aquí solo se llama y se mapea.
 *
 * Los errores se lanzan tal cual llegan de PostgREST; `warehouseErrorMessage`
 * los vuelve legibles (el RAISE en español «Sin permiso para ver esta bodega»
 * con código 42501 se respeta tal cual).
 */
import { parseTransferListPage, type TransferListPage } from '@/components/transfers/utils/transferModel';
import { errorMessage } from '@/lib/errorMessage';
import { supabase } from '@/lib/supabase';
import {
  parseMyWarehouses,
  parseWarehouseHistoryPage,
  parseWarehouseStockPage,
  type MyWarehouses,
  type WarehouseHistoryPage,
  type WarehouseStockPage,
} from '../../utils/warehouseModel';
import type { WarehouseMovementType } from '../../utils/warehouseHistory';
import { WAREHOUSES_UNAVAILABLE_MESSAGE } from '../../utils/warehouseTexts';

export const WAREHOUSE_STOCK_PAGE_SIZE = 30;
export const WAREHOUSE_HISTORY_PAGE_SIZE = 20;
export const WAREHOUSE_TRANSFERS_PAGE_SIZE = 50;

/** Traslados que vienen hacia la bodega (lo mismo que suma `incoming_transfers`). */
export const INCOMING_TRANSFER_STATUSES = ['in_transit', 'partially_received', 'with_differences'] as const;
export const PENDING_DISPATCH_STATUSES = ['pending_dispatch'] as const;

/** ¿El servidor todavía no tiene las RPC de bodegas? (migración sin aplicar). */
export function isWarehousesUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  return String(record.code ?? '') === 'PGRST202' || /could not find the function/i.test(String(record.message ?? ''));
}

/** Mensaje legible para la pantalla. */
export function warehouseErrorMessage(error: unknown, fallback: string): string {
  if (isWarehousesUnavailableError(error)) return WAREHOUSES_UNAVAILABLE_MESSAGE;
  return errorMessage(error, fallback);
}

export async function fetchMyWarehouses(): Promise<MyWarehouses> {
  const { data, error } = await supabase.rpc('list_my_warehouses');
  if (error) throw error;
  return parseMyWarehouses(data);
}

export async function fetchWarehouseStock(input: {
  warehouseId: string;
  search: string;
  page: number;
  pageSize?: number;
}): Promise<WarehouseStockPage> {
  const { data, error } = await supabase.rpc('get_warehouse_stock', {
    p_warehouse_id: input.warehouseId,
    p_search: input.search.trim(),
    p_page: input.page,
    p_page_size: input.pageSize ?? WAREHOUSE_STOCK_PAGE_SIZE,
  });
  if (error) throw error;
  return parseWarehouseStockPage(data);
}

export async function fetchWarehouseHistory(input: {
  warehouseId: string;
  movementTypes: readonly WarehouseMovementType[] | null;
  dateFrom: string | null;
  dateTo: string | null;
  page: number;
  pageSize?: number;
}): Promise<WarehouseHistoryPage> {
  const { data, error } = await supabase.rpc('get_warehouse_history', {
    p_warehouse_id: input.warehouseId,
    p_date_from: input.dateFrom ?? undefined,
    p_date_to: input.dateTo ?? undefined,
    p_movement_types: input.movementTypes ? [...input.movementTypes] : undefined,
    p_search: '',
    p_page: input.page,
    p_page_size: input.pageSize ?? WAREHOUSE_HISTORY_PAGE_SIZE,
  });
  if (error) throw error;
  return parseWarehouseHistoryPage(data);
}

export type WarehouseTransfers = {
  /** Hacia la bodega: en tránsito, recibidos en parte o con diferencias. */
  incoming: TransferListPage;
  /** Desde la bodega: esperan despacho. */
  pendingDispatch: TransferListPage;
};

/** Traslados en camino hacia la bodega y por despachar desde ella (dos consultas en paralelo). */
export async function fetchWarehouseTransfers(warehouseId: string): Promise<WarehouseTransfers> {
  const [incoming, pendingDispatch] = await Promise.all([
    supabase.rpc('list_transfer_orders_page', {
      p_statuses: [...INCOMING_TRANSFER_STATUSES],
      p_destination_warehouse_id: warehouseId,
      p_page: 1,
      p_page_size: WAREHOUSE_TRANSFERS_PAGE_SIZE,
    }),
    supabase.rpc('list_transfer_orders_page', {
      p_statuses: [...PENDING_DISPATCH_STATUSES],
      p_source_warehouse_id: warehouseId,
      p_page: 1,
      p_page_size: WAREHOUSE_TRANSFERS_PAGE_SIZE,
    }),
  ]);
  if (incoming.error) throw incoming.error;
  if (pendingDispatch.error) throw pendingDispatch.error;
  return {
    incoming: parseTransferListPage(incoming.data),
    pendingDispatch: parseTransferListPage(pendingDispatch.data),
  };
}
