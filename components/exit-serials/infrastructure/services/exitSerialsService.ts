// Sólo se importa la regla de normalización del módulo de salidas (no su store),
// para que "abc-123" y "ABC123" se consideren el mismo serial en todas partes.
import { normalizeSerial } from '@/components/exits/infrastructure/services/exitSerials';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

type ExitSerialRow = Database['public']['Functions']['get_exit_serials']['Returns'][number];
type DeliveryOrderSerialRow = Database['public']['Functions']['get_delivery_order_serials']['Returns'][number];

export type SerialReleaseReason = 'exit_cancelled' | 'returned';
export type SerialCaptureMethod = 'scan' | 'manual';

/** Serial de fábrica registrado en una salida, listo para mostrar. */
export interface ExitSerialRecord {
  inventoryExitId: string;
  productId: string;
  serial: string;
  /** Misma clave que `normalizeSerial`; sirve para buscar sin importar guiones ni mayúsculas. */
  normalized: string;
  method: SerialCaptureMethod;
  /** null = activo; si no, el motivo por el que se liberó. */
  releasedReason: SerialReleaseReason | null;
}

/** Serial entregado en una orden, con los datos de la salida que lo despachó. */
export interface DeliveryOrderSerialRecord extends ExitSerialRecord {
  warehouseId: string;
  warehouseName: string | null;
  exitCreatedAt: string;
}

/** Etiqueta corta junto al chip de un serial liberado. */
export const SERIAL_RELEASE_SHORT_LABEL: Record<SerialReleaseReason, string> = {
  exit_cancelled: 'anulada',
  returned: 'devuelto',
};

/** Estado completo en el detalle de seriales de un producto. */
export function serialStatusLabel(reason: SerialReleaseReason | null): string {
  if (reason === 'exit_cancelled') return 'Liberado por anulación';
  if (reason === 'returned') return 'Devuelto';
  return 'Activo';
}

export function captureMethodLabel(method: SerialCaptureMethod): string {
  return method === 'scan' ? 'Escaneado' : 'Digitado';
}

/** Llave lógica de una línea de orden: el mismo producto puede venir de varias bodegas. */
export function deliveryOrderSerialKey(productId: string, warehouseId: string | null | undefined): string {
  return `${productId}:${warehouseId ?? ''}`;
}

/** ¿El texto buscado corresponde (total o parcialmente) a este serial? */
export function serialMatchesQuery(serial: Pick<ExitSerialRecord, 'normalized'>, query: string): boolean {
  const needle = normalizeSerial(query);
  return needle.length > 0 && serial.normalized.includes(needle);
}

function toReleaseReason(value: string | null | undefined): SerialReleaseReason | null {
  return value === 'exit_cancelled' || value === 'returned' ? value : null;
}

function toRecord(row: Pick<ExitSerialRow, 'inventory_exit_id' | 'product_id' | 'serial_number' | 'capture_method' | 'released_reason'>): ExitSerialRecord {
  return {
    inventoryExitId: row.inventory_exit_id,
    productId: row.product_id,
    serial: row.serial_number,
    normalized: normalizeSerial(row.serial_number),
    method: row.capture_method === 'scan' ? 'scan' : 'manual',
    releasedReason: toReleaseReason(row.released_reason),
  };
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
    return groups;
  }, {});
}

/** El RPC acepta como máximo 500 salidas por llamada. */
const EXIT_IDS_PER_REQUEST = 500;

/**
 * Seriales de las salidas indicadas, agrupados por salida. Son complementarios:
 * si la consulta falla (sin red, migración aún no aplicada o sin permiso) se
 * devuelve un objeto vacío y la pantalla se ve igual, sin seriales. Nunca lanza.
 */
export async function fetchExitSerialsByExitId(exitIds: string[]): Promise<Record<string, ExitSerialRecord[]>> {
  const ids = [...new Set(exitIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += EXIT_IDS_PER_REQUEST) {
    chunks.push(ids.slice(index, index + EXIT_IDS_PER_REQUEST));
  }

  try {
    const results = await Promise.all(
      chunks.map((chunk) => supabase.rpc('get_exit_serials', { p_exit_ids: chunk })),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.warn('No se pudieron cargar los seriales de las salidas:', failed.error.message);
      return {};
    }
    const records = results.flatMap((result) => result.data ?? []).map(toRecord);
    return groupBy(records, (record) => record.inventoryExitId);
  } catch (error) {
    console.warn('No se pudieron cargar los seriales de las salidas:', error);
    return {};
  }
}

/**
 * Seriales entregados en una orden, agrupados por línea (producto + bodega).
 * Igual que `fetchExitSerialsByExitId`, un fallo deja la lista sin seriales. Nunca lanza.
 */
export async function fetchDeliveryOrderSerials(
  deliveryOrderId: string,
): Promise<Record<string, DeliveryOrderSerialRecord[]>> {
  if (!deliveryOrderId) return {};

  try {
    const { data, error } = await supabase.rpc('get_delivery_order_serials', {
      p_delivery_order_id: deliveryOrderId,
    });
    if (error) {
      console.warn('No se pudieron cargar los seriales de la orden:', error.message);
      return {};
    }
    const records = (data ?? []).map((row: DeliveryOrderSerialRow): DeliveryOrderSerialRecord => ({
      ...toRecord(row),
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name || null,
      exitCreatedAt: row.exit_created_at,
    }));
    return groupBy(records, (record) => deliveryOrderSerialKey(record.productId, record.warehouseId));
  } catch (error) {
    console.warn('No se pudieron cargar los seriales de la orden:', error);
    return {};
  }
}
