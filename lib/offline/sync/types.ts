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

export type CreateCustomerPayload = {
  customerId: string;
  name: string;
  idNumber: string;
  phone: string | null;
};

export type RegisterPagoPayload = {
  pagoLocalId: string;
  negocioId: string;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  notes: string | null;
  routeStopId?: string | null;
};

export type UpdateRouteStopPayload = {
  stopId: string;
  status: 'sin_pago' | 'reprogramado' | 'omitido';
  reason: string;
  notes?: string | null;
};

export type RouteIdPayload = { routeId: string; cancel?: boolean };
export type SelectStopPayload = { stopId: string };

export type AttachPagoSupportPayload = {
  fileUploadId: string;
  negocioId: string;
  pagoLocalId: string;
};

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
  roles: PullRole[];
  customers: CollectionChanges<PullCustomer>;
  negocios: CollectionChanges<PullNegocio>;
  negocio_cuotas: CollectionChanges<PullCuota>;
  negocio_pagos: CollectionChanges<PullPago>;
  collection_routes: CollectionChanges<PullRoute>;
  collection_route_stops: CollectionChanges<PullStop>;
  municipios: CollectionChanges<PullMunicipio>;
};

export function toEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
