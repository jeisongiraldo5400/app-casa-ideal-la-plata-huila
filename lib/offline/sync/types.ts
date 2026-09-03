export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export type OutboxCommandType =
  | 'create_customer'
  | 'register_pago'
  | 'register_route_pago'
  | 'update_route_stop'
  | 'start_route'
  | 'finish_route'
  | 'select_route_stop'
  | 'attach_pago_support';

/**
 * Estado previo de las filas locales modificadas de forma optimista. Permite
 * revertirlas si el servidor rechaza el comando de forma definitiva.
 */
export type CuotaSnapshot = {
  id: string;
  paidAmount: number;
  status: string;
  rowSyncStatus: string;
};

export type StopSnapshot = {
  id: string;
  status: string;
  paymentId: string | null;
  paymentAmount: number | null;
  outcomeReason: string | null;
  notes: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  rowSyncStatus: string;
};

export type RouteSnapshot = {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  rowSyncStatus: string;
};

export type OptimisticSnapshot = {
  cuotas?: CuotaSnapshot[];
  negocio?: { id: string; remainingBalance: number };
  stops?: StopSnapshot[];
  route?: RouteSnapshot;
};

/** Campos comunes a todo comando encolado. */
export type OutboxPayloadBase = {
  /** Carril de dependencia: los comandos de un mismo carril se envían en orden. */
  lane?: string;
  snapshot?: OptimisticSnapshot;
};

export type CreateCustomerPayload = OutboxPayloadBase & {
  customerId: string;
  name: string;
  idNumber: string;
  phone: string | null;
};

export type RegisterPagoPayload = OutboxPayloadBase & {
  pagoLocalId: string;
  negocioId: string;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  notes: string | null;
  routeStopId?: string | null;
  routeId?: string | null;
};

export type UpdateRouteStopPayload = OutboxPayloadBase & {
  stopId: string;
  routeId?: string | null;
  status: 'sin_pago' | 'reprogramado' | 'omitido';
  reason: string;
  notes?: string | null;
};

export type RouteIdPayload = OutboxPayloadBase & { routeId: string; cancel?: boolean };
export type SelectStopPayload = OutboxPayloadBase & { stopId: string; routeId?: string | null };

export type AttachPagoSupportPayload = OutboxPayloadBase & {
  fileUploadId: string;
  negocioId: string;
  pagoLocalId: string;
};

/**
 * Deriva el carril de un comando. Los comandos con `lane` explícito lo
 * conservan (p. ej. el soporte de un pago comparte carril con su pago).
 */
export function laneForCommand(type: OutboxCommandType, payload: Record<string, unknown>): string {
  if (typeof payload.lane === 'string' && payload.lane) return payload.lane;
  const routeId = typeof payload.routeId === 'string' ? payload.routeId : null;
  switch (type) {
    case 'create_customer':
      return `customer:${String(payload.customerId || '')}`;
    case 'register_pago':
    case 'attach_pago_support':
      return `negocio:${String(payload.negocioId || '')}`;
    case 'register_route_pago':
      return routeId ? `route:${routeId}` : `negocio:${String(payload.negocioId || '')}`;
    case 'start_route':
    case 'finish_route':
      return `route:${String(payload.routeId || '')}`;
    case 'select_route_stop':
    case 'update_route_stop':
      return routeId ? `route:${routeId}` : `stop:${String(payload.stopId || '')}`;
    default:
      return `type:${type}`;
  }
}

export type CollectionChanges<T> = {
  upserts: T[];
  deleted: string[];
};

export type PullCustomer = {
  id: string;
  name: string;
  id_number: string;
  phone: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export type PullNegocio = {
  id: string;
  numero: number;
  status: string;
  deal_date: string | null;
  total_credit: number;
  remaining_balance: number;
  customer_id: string;
  codeudor_customer_id: string | null;
  direccion: string | null;
  municipio_id: string | null;
  municipio_name: string | null;
  seller_id: string | null;
  gestor_cobro_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export type PullCuota = {
  id: string;
  negocio_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  late_fee_amount: number;
  status: string;
  updated_at: string | null;
  deleted_at: string | null;
};

export type PullPago = {
  id: string;
  negocio_id: string;
  cuota_id: string | null;
  amount: number;
  paid_at: string;
  receipt_number: string | null;
  virtual_receipt_number: string | null;
  receipt_status: string | null;
  notes: string | null;
  created_by_name?: string | null;
  created_at: string | null;
  deleted_at: string | null;
};

export type PullRoute = {
  id: string;
  gestor_id: string;
  route_date: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_expected: number;
  total_collected: number;
  updated_at: string | null;
};

export type PullStop = {
  id: string;
  route_id: string;
  negocio_id: string;
  negocio_numero: number;
  position: number;
  status: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  municipality_name: string | null;
  expected_balance: number;
  payment_id: string | null;
  payment_amount: number | null;
  outcome_reason: string | null;
  notes: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

export type PullMunicipio = { id: string; nombre: string; is_active: boolean };
export type PullRole = { id: string; role_id: string; nombre: string };

export type PullPayload = {
  server_time: string;
  must_wipe: boolean;
  truncated: boolean;
  /** Nombre visible del usuario que sincroniza (para recibos sin red). */
  profile_name?: string | null;
  roles: PullRole[];
  customers: CollectionChanges<PullCustomer>;
  negocios: CollectionChanges<PullNegocio>;
  negocio_cuotas: CollectionChanges<PullCuota>;
  negocio_pagos: CollectionChanges<PullPago>;
  collection_routes: CollectionChanges<PullRoute>;
  collection_route_stops: CollectionChanges<PullStop>;
  municipios: CollectionChanges<PullMunicipio>;
};

export function assertPullIsComplete(payload: PullPayload, limit: number) {
  if (!payload.truncated) return;
  throw new Error(
    `La descarga supera el límite seguro de ${limit} negocios. No se reemplazaron los datos locales; se requiere paginación en el servidor.`
  );
}

export function toEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Solapamiento del cursor delta: una transacción concurrente puede confirmar
 * con `updated_at` anterior al `server_time` del pull después de que el pull
 * tomó su snapshot. Volver a pedir esos segundos es idempotente (upserts).
 */
export const PULL_CURSOR_OVERLAP_MS = 10_000;

export function cursorFromServerTime(serverTime: string, overlapMs = PULL_CURSOR_OVERLAP_MS): string {
  const parsed = Date.parse(serverTime);
  if (Number.isNaN(parsed)) return serverTime;
  return new Date(parsed - overlapMs).toISOString();
}
