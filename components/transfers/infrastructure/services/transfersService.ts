/**
 * Acceso a las RPC de órdenes de traslado (contrato: migraciones
 * 20261231280000 / 20261231290000 / 20261231450000). El móvil solo despacha, recibe y confirma
 * devoluciones; los traslados se crean en la web.
 *
 * Los errores se lanzan tal cual llegan de PostgREST: `errorMessage` deja los
 * RAISE del servidor en español sin tocarlos («Quien despachó el traslado no
 * puede recibirlo», etc.).
 */
import { supabase } from '@/lib/supabase';
import {
  parseTransferDetail,
  parseTransferListPage,
  parseTransferTasks,
  parseTransferWriteResult,
  parseWarehouseMemberships,
  type TransferDetail,
  type TransferListPage,
  type TransferTasks,
  type TransferWriteResult,
  type WarehouseMembership,
} from '../../utils/transferModel';
import type { DispatchPayloadItem, ReceivePayloadItem, ReturnPayloadItem } from '../../utils/transferRules';
import type { Json } from '@/types/database.types';

/** ¿El servidor todavía no tiene las RPC de traslados? (migración sin aplicar). */
export function isTransfersUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  return String(record.code ?? '') === 'PGRST202' || /could not find the function/i.test(String(record.message ?? ''));
}

export async function fetchMyTransferTasks(): Promise<TransferTasks> {
  const { data, error } = await supabase.rpc('get_my_transfer_tasks');
  if (error) throw error;
  return parseTransferTasks(data);
}

export async function fetchMyWarehouseMemberships(): Promise<WarehouseMembership[]> {
  const { data, error } = await supabase.rpc('get_my_warehouse_memberships');
  if (error) throw error;
  return parseWarehouseMemberships(data);
}

/**
 * Historial de traslados, igual que la lista de la web
 * (`list_transfer_orders_page`): el servidor filtra por permisos, estado y
 * búsqueda (número o producto) y pagina.
 */
export async function fetchTransferOrdersPage(input: {
  statuses: readonly string[] | null;
  search: string;
  page: number;
  pageSize: number;
}): Promise<TransferListPage> {
  const { data, error } = await supabase.rpc('list_transfer_orders_page', {
    p_statuses: input.statuses ? [...input.statuses] : undefined,
    p_search: input.search.trim(),
    p_page: input.page,
    p_page_size: input.pageSize,
  });
  if (error) throw error;
  return parseTransferListPage(data);
}

export async function fetchTransferDetail(transferOrderId: string): Promise<TransferDetail> {
  const { data, error } = await supabase.rpc('get_transfer_order_detail', { p_transfer_order_id: transferOrderId });
  if (error) throw error;
  if (!data) throw new Error('El traslado no existe o no tiene permiso para verlo');
  return parseTransferDetail(data);
}

type WriteBase = { transferOrderId: string; notes: string; idempotencyKey: string };
/** Ruta ya subida a `transfer-photos` (opcional, 20261231350000). */
type PhotoInput = { photoPath?: string | null };

const cleanNotes = (notes: string): string | undefined => {
  const trimmed = notes.trim();
  return trimmed ? trimmed : undefined;
};

export async function dispatchTransfer(
  input: WriteBase &
    PhotoInput & {
      items: DispatchPayloadItem[];
      carrierUserId: string | null;
      /** Quiénes pueden recibir en el destino (≥ 1; 20261231450000). */
      receiverIds: string[];
    }
): Promise<TransferWriteResult> {
  const { data, error } = await supabase.rpc('dispatch_transfer_order', {
    p_transfer_order_id: input.transferOrderId,
    p_items: input.items as unknown as Json,
    p_carrier_user_id: input.carrierUserId ?? undefined,
    p_notes: cleanNotes(input.notes),
    p_photo_path: input.photoPath ?? undefined,
    p_idempotency_key: input.idempotencyKey,
    p_receiver_ids: input.receiverIds,
  });
  if (error) throw error;
  return parseTransferWriteResult(data);
}

export async function receiveTransfer(
  input: WriteBase & PhotoInput & { items: ReceivePayloadItem[]; reportMissing: boolean }
): Promise<TransferWriteResult> {
  const { data, error } = await supabase.rpc('receive_transfer_order', {
    p_transfer_order_id: input.transferOrderId,
    p_items: input.items as unknown as Json,
    p_notes: cleanNotes(input.notes),
    p_photo_path: input.photoPath ?? undefined,
    p_report_missing: input.reportMissing,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return parseTransferWriteResult(data);
}

export async function confirmTransferReturn(
  input: WriteBase & { items: ReturnPayloadItem[] }
): Promise<TransferWriteResult> {
  const { data, error } = await supabase.rpc('confirm_transfer_return', {
    p_transfer_order_id: input.transferOrderId,
    p_items: input.items as unknown as Json,
    p_notes: cleanNotes(input.notes),
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return parseTransferWriteResult(data);
}
