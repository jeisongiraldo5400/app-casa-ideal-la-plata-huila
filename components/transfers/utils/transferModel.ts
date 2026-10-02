/**
 * Forma de las órdenes de traslado tal como las devuelven las RPC
 * (`get_my_transfer_tasks`, `get_transfer_order_detail`; migraciones
 * 20261231280000, 20261231290000 y 20261231450000). Todas devuelven `Json`: aquí se
 * convierten a tipos propios sin confiar en el servidor (numeric llega como
 * número o como texto, un campo nulo no debe tumbar la pantalla).
 */

export type TransferStatus =
  | 'draft'
  | 'pending_dispatch'
  | 'in_transit'
  | 'partially_received'
  | 'received'
  | 'with_differences'
  | 'closed_with_differences'
  | 'cancelled';

const STATUSES: readonly TransferStatus[] = [
  'draft',
  'pending_dispatch',
  'in_transit',
  'partially_received',
  'received',
  'with_differences',
  'closed_with_differences',
  'cancelled',
];

export type PersonRef = { id: string; name: string };
export type WarehouseRef = { id: string; name: string };

export interface TransferSummary {
  id: string;
  orderNumber: string;
  status: TransferStatus;
  sourceWarehouse: WarehouseRef;
  destinationWarehouse: WarehouseRef;
  carrier: PersonRef | null;
  createdBy: PersonRef | null;
  dispatchedBy: PersonRef | null;
  /** Todos los que recibieron alguna parte, en orden (20261231340000). */
  receivedByNames: string[];
  /** Hora de la última recepción (receivedAt solo se llena al recibir todo). */
  lastReceivedAt: string | null;
  notes: string | null;
  createdAt: string | null;
  dispatchedAt: string | null;
  dueAt: string | null;
  receivedAt: string | null;
  itemsCount: number;
  totalQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  returnedQuantity: number;
  returnPendingQuantity: number;
  writtenOffQuantity: number;
  inTransitQuantity: number;
  pendingReceiptQuantity: number;
  isOverdue: boolean;
}

export type TransferSerialStatus = 'in_transit' | 'received' | 'return_pending' | 'returned' | 'written_off';

export interface TransferSerial {
  serialNumber: string;
  status: TransferSerialStatus | string;
}

export interface TransferItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  /** Reservado al enviar a despacho. */
  quantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  returnPendingQuantity: number;
  returnedQuantity: number;
  writtenOffQuantity: number;
  inTransitQuantity: number;
  pendingReceiptQuantity: number;
  availableAtSource: number | null;
  notes: string | null;
  hasSerials: boolean;
  serials: TransferSerial[];
}

export interface TransferPermissions {
  canDispatch: boolean;
  canReceive: boolean;
  canConfirmReturn: boolean;
  isAdmin: boolean;
}

/** Evento del historial del traslado (`events` del detalle). */
export interface TransferEvent {
  id: string;
  eventType: string;
  itemId: string | null;
  productName: string | null;
  quantity: number;
  condition: 'ok' | 'damaged' | null;
  photoPath: string | null;
  userName: string | null;
  createdAt: string | null;
}

/** Persona que se puede habilitar para recibir al despachar (20261231450000). */
export interface ReceiverOption extends PersonRef {
  /** Encargado (Responsable) de la bodega destino: se preselecciona. */
  isManager: boolean;
  isAdmin: boolean;
  /** Quien consulta: si despacha, no puede quedar como receptor. */
  isMe: boolean;
}

export interface TransferDetail {
  order: TransferSummary;
  items: TransferItem[];
  events: TransferEvent[];
  /** Habilitados al despachar si `receiversAssigned`; si no, todos los bodegueros (regla anterior). */
  receivers: PersonRef[];
  receiversAssigned: boolean;
  /** Solo llega a quien puede despachar. */
  receiverOptions: ReceiverOption[];
  permissions: TransferPermissions;
}

export interface TransferTasks {
  toDispatch: TransferSummary[];
  toReceive: TransferSummary[];
  carrying: TransferSummary[];
  toConfirmReturn: TransferSummary[];
}

export interface WarehouseMembership {
  warehouseId: string;
  warehouseName: string;
  canDispatch: boolean;
  canReceive: boolean;
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
const numOrNull = (value: unknown): number | null => (value == null ? null : num(value));
const bool = (value: unknown): boolean => value === true;

function parsePerson(value: unknown): PersonRef | null {
  const record = asObj(value);
  const id = strOrNull(record.id);
  if (!id) return null;
  return { id, name: strOrNull(record.name) ?? 'Sin nombre' };
}

function parseWarehouse(value: unknown): WarehouseRef {
  const record = asObj(value);
  return { id: str(record.id), name: strOrNull(record.name) ?? 'Bodega' };
}

export function parseStatus(value: unknown): TransferStatus {
  const text = str(value) as TransferStatus;
  return STATUSES.includes(text) ? text : 'draft';
}

export function parseTransferSummary(value: unknown): TransferSummary {
  const r = asObj(value);
  return {
    id: str(r.id),
    orderNumber: strOrNull(r.order_number) ?? 'Traslado',
    status: parseStatus(r.status),
    sourceWarehouse: parseWarehouse(r.source_warehouse),
    destinationWarehouse: parseWarehouse(r.destination_warehouse),
    carrier: parsePerson(r.carrier),
    createdBy: parsePerson(r.created_by),
    dispatchedBy: parsePerson(r.dispatched_by),
    receivedByNames: Array.isArray(r.received_by_names)
      ? r.received_by_names.filter((name): name is string => typeof name === 'string' && name.length > 0)
      : [],
    lastReceivedAt: strOrNull(r.last_received_at),
    notes: strOrNull(r.notes),
    createdAt: strOrNull(r.created_at),
    dispatchedAt: strOrNull(r.dispatched_at),
    dueAt: strOrNull(r.due_at),
    receivedAt: strOrNull(r.received_at),
    itemsCount: num(r.items_count),
    totalQuantity: num(r.total_quantity),
    dispatchedQuantity: num(r.dispatched_quantity),
    receivedQuantity: num(r.received_quantity),
    damagedQuantity: num(r.damaged_quantity),
    returnedQuantity: num(r.returned_quantity),
    returnPendingQuantity: num(r.return_pending_quantity),
    writtenOffQuantity: num(r.written_off_quantity),
    inTransitQuantity: num(r.in_transit_quantity),
    pendingReceiptQuantity: num(r.pending_receipt_quantity),
    isOverdue: bool(r.is_overdue),
  };
}

export function parseTransferItem(value: unknown): TransferItem {
  const r = asObj(value);
  return {
    id: str(r.id),
    productId: str(r.product_id),
    productName: strOrNull(r.product_name) ?? 'Producto',
    productSku: strOrNull(r.product_sku),
    quantity: num(r.quantity),
    dispatchedQuantity: num(r.dispatched_quantity),
    receivedQuantity: num(r.received_quantity),
    damagedQuantity: num(r.damaged_quantity),
    returnPendingQuantity: num(r.return_pending_quantity),
    returnedQuantity: num(r.returned_quantity),
    writtenOffQuantity: num(r.written_off_quantity),
    inTransitQuantity: num(r.in_transit_quantity),
    pendingReceiptQuantity: num(r.pending_receipt_quantity),
    availableAtSource: numOrNull(r.available_at_source),
    notes: strOrNull(r.notes),
    hasSerials: bool(r.has_serials),
    serials: asArray(r.serials).map((serial) => {
      const s = asObj(serial);
      return { serialNumber: str(s.serial_number), status: str(s.status) };
    }),
  };
}

export function parseTransferEvent(value: unknown): TransferEvent {
  const r = asObj(value);
  const condition = str(r.condition);
  return {
    id: str(r.id),
    eventType: str(r.event_type),
    itemId: strOrNull(r.item_id),
    productName: strOrNull(r.product_name),
    quantity: num(r.quantity),
    condition: condition === 'ok' || condition === 'damaged' ? condition : null,
    photoPath: strOrNull(r.photo_path),
    userName: strOrNull(r.user_name),
    createdAt: strOrNull(r.created_at),
  };
}

function parseReceiverOption(value: unknown): ReceiverOption | null {
  const person = parsePerson(value);
  if (!person) return null;
  const r = asObj(value);
  return { ...person, isManager: bool(r.is_manager), isAdmin: bool(r.is_admin), isMe: bool(r.is_me) };
}

export function parseTransferDetail(value: unknown): TransferDetail {
  const r = asObj(value);
  const permissions = asObj(r.permissions);
  return {
    order: parseTransferSummary(r.order),
    items: asArray(r.items).map(parseTransferItem),
    events: asArray(r.events).map(parseTransferEvent),
    receivers: asArray(r.receivers)
      .map(parsePerson)
      .filter((person): person is PersonRef => person !== null),
    receiversAssigned: bool(r.receivers_assigned),
    receiverOptions: asArray(r.receiver_options)
      .map(parseReceiverOption)
      .filter((option): option is ReceiverOption => option !== null),
    permissions: {
      canDispatch: bool(permissions.can_dispatch),
      canReceive: bool(permissions.can_receive),
      canConfirmReturn: bool(permissions.can_confirm_return),
      isAdmin: bool(permissions.is_admin),
    },
  };
}

export function parseTransferTasks(value: unknown): TransferTasks {
  const r = asObj(value);
  const list = (key: string) => asArray(r[key]).map(parseTransferSummary);
  return {
    toDispatch: list('to_dispatch'),
    toReceive: list('to_receive'),
    carrying: list('carrying'),
    toConfirmReturn: list('to_confirm_return'),
  };
}

export function parseWarehouseMemberships(value: unknown): WarehouseMembership[] {
  return asArray(value).map((row) => {
    const r = asObj(row);
    return {
      warehouseId: str(r.warehouse_id),
      warehouseName: strOrNull(r.warehouse_name) ?? 'Bodega',
      canDispatch: bool(r.can_dispatch),
      canReceive: bool(r.can_receive),
    };
  });
}

/** Respuesta mínima de las RPC que escriben (+ `replayed` en reintentos). */
export interface TransferWriteResult {
  transferOrderId: string;
  orderNumber: string;
  status: TransferStatus;
  replayed: boolean;
  /** Campos propios de cada RPC (dispatched_quantity, released_quantity, …). */
  quantities: Record<string, number>;
}

export function parseTransferWriteResult(value: unknown): TransferWriteResult {
  const r = asObj(value);
  const quantities: Record<string, number> = {};
  for (const [key, raw] of Object.entries(r)) {
    if (key.endsWith('_quantity') || key === 'quantity') quantities[key] = num(raw);
  }
  return {
    transferOrderId: str(r.transfer_order_id),
    orderNumber: strOrNull(r.order_number) ?? 'Traslado',
    status: parseStatus(r.status),
    replayed: bool(r.replayed),
    quantities,
  };
}

/** Página de `list_transfer_orders_page` (historial: lo mismo que la lista de la web). */
export interface TransferListPage {
  totalCount: number;
  rows: TransferSummary[];
}

export function parseTransferListPage(value: unknown): TransferListPage {
  const r = asObj(value);
  return {
    totalCount: num(r.total_count),
    rows: Array.isArray(r.rows) ? r.rows.map(parseTransferSummary) : [],
  };
}

