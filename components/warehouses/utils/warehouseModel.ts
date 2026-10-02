/**
 * Forma de las bodegas tal como las devuelven las RPC (`list_my_warehouses`,
 * `get_warehouse_stock`, `get_warehouse_history`; migración 20261231390000).
 * Todas devuelven `Json`: aquí se convierten a tipos propios sin confiar en el
 * servidor (numeric llega como número o como texto, un campo nulo no debe
 * tumbar la pantalla).
 */
import { isMovementType, type WarehouseMovementType } from './warehouseHistory';

export interface WarehouseSummary {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  isActive: boolean;
  /** Productos con existencias (> 0). */
  totalProducts: number;
  totalUnits: number;
  /** Traslados que vienen hacia la bodega (en tránsito, recibidos en parte o con diferencias). */
  incomingTransfers: number;
  incomingUnits: number;
  /** Traslados que salen de la bodega y esperan despacho. */
  pendingDispatch: number;
  /** ¿El usuario es Responsable de la bodega? (el admin ve todas aunque no lo sea). */
  isManager: boolean;
  managers: string[];
}

export interface MyWarehouses {
  isAdmin: boolean;
  warehouses: WarehouseSummary[];
}

export interface WarehouseStockRow {
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  /** Unidades que vienen en traslados hacia la bodega. */
  incoming: number;
}

export interface WarehouseStockPage {
  warehouse: { id: string; name: string; isActive: boolean } | null;
  totalCount: number;
  rows: WarehouseStockRow[];
}

export type WarehouseDocumentType = 'purchase_order' | 'delivery_order' | 'return' | 'transfer_order';

export interface WarehouseHistoryRow {
  key: string;
  movementType: WarehouseMovementType;
  occurredAt: string;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  /** Con signo: + entra, − sale (en separados, el cambio del disponible). */
  quantity: number | null;
  stockEffect: number;
  /** Existencias físicas del producto en la bodega después del movimiento. */
  stockAfter: number | null;
  documentType: WarehouseDocumentType | null;
  documentId: string | null;
  documentNumber: string | null;
  detail: string | null;
  notes: string | null;
  userName: string | null;
  isCancelled: boolean;
  serials: string[];
}

export interface WarehouseHistoryPage {
  warehouse: { id: string; name: string; isActive: boolean; deleted: boolean } | null;
  totalCount: number;
  rows: WarehouseHistoryRow[];
}

type Obj = Record<string, unknown>;

const asObj = (value: unknown): Obj =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const strOrNull = (value: unknown): string | null => {
  const text = str(value).trim();
  return text ? text : null;
};
const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const bool = (value: unknown): boolean => value === true;

export function parseWarehouseSummary(value: unknown): WarehouseSummary {
  const r = asObj(value);
  return {
    id: str(r.id),
    name: strOrNull(r.name) ?? 'Bodega',
    city: strOrNull(r.city),
    address: strOrNull(r.address),
    isActive: r.is_active !== false,
    totalProducts: num(r.total_products),
    totalUnits: num(r.total_units),
    incomingTransfers: num(r.incoming_transfers),
    incomingUnits: num(r.incoming_units),
    pendingDispatch: num(r.pending_dispatch),
    isManager: bool(r.is_manager),
    managers: asArray(r.managers)
      .map((name) => strOrNull(name))
      .filter((name): name is string => name !== null),
  };
}

export function parseMyWarehouses(value: unknown): MyWarehouses {
  const r = asObj(value);
  return {
    isAdmin: bool(r.is_admin),
    warehouses: asArray(r.warehouses)
      .map(parseWarehouseSummary)
      .filter((warehouse) => warehouse.id !== ''),
  };
}

export function parseWarehouseStockPage(value: unknown): WarehouseStockPage {
  const r = asObj(value);
  const warehouse = asObj(r.warehouse);
  return {
    warehouse: strOrNull(warehouse.id)
      ? { id: str(warehouse.id), name: strOrNull(warehouse.name) ?? 'Bodega', isActive: warehouse.is_active !== false }
      : null,
    totalCount: num(r.total_count),
    rows: asArray(r.rows)
      .map((raw): WarehouseStockRow => {
        const row = asObj(raw);
        return {
          productId: str(row.product_id),
          name: strOrNull(row.name) ?? 'Producto',
          sku: strOrNull(row.sku),
          barcode: strOrNull(row.barcode),
          quantity: num(row.quantity),
          incoming: num(row.incoming),
        };
      })
      .filter((row) => row.productId !== ''),
  };
}

const DOCUMENT_TYPES: readonly WarehouseDocumentType[] = ['purchase_order', 'delivery_order', 'return', 'transfer_order'];

function parseHistoryRow(value: unknown): WarehouseHistoryRow | null {
  const r = asObj(value);
  if (!isMovementType(r.movement_type)) return null;
  return {
    key: str(r.key),
    movementType: r.movement_type,
    occurredAt: str(r.occurred_at),
    productId: strOrNull(r.product_id),
    productName: strOrNull(r.product_name),
    productSku: strOrNull(r.product_sku),
    quantity: numOrNull(r.quantity),
    stockEffect: num(r.stock_effect),
    stockAfter: numOrNull(r.stock_after),
    documentType: DOCUMENT_TYPES.find((type) => type === r.document_type) ?? null,
    documentId: strOrNull(r.document_id),
    documentNumber: strOrNull(r.document_number),
    detail: strOrNull(r.detail),
    notes: strOrNull(r.notes),
    userName: strOrNull(r.user_name),
    isCancelled: bool(r.is_cancelled),
    serials: asArray(r.serials).map(str).filter(Boolean),
  };
}

/** Página del historial; las filas de un tipo desconocido se descartan (servidor más nuevo). */
export function parseWarehouseHistoryPage(value: unknown): WarehouseHistoryPage {
  const r = asObj(value);
  const warehouse = asObj(r.warehouse);
  return {
    warehouse: strOrNull(warehouse.id)
      ? {
          id: str(warehouse.id),
          name: strOrNull(warehouse.name) ?? 'Bodega',
          isActive: warehouse.is_active !== false,
          deleted: bool(warehouse.deleted),
        }
      : null,
    totalCount: num(r.total_count),
    rows: asArray(r.rows)
      .map(parseHistoryRow)
      .filter((row): row is WarehouseHistoryRow => row !== null),
  };
}
