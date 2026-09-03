import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class Customer extends Model {
  static table = 'customers';
  @field('name') name!: string;
  @field('id_number') idNumber!: string;
  @field('phone') phone!: string | null;
  @field('sync_status') rowSyncStatus!: string;
  @field('local_updated_at') localUpdatedAt!: number;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class Negocio extends Model {
  static table = 'negocios';
  @field('numero') numero!: number;
  @field('status') status!: string;
  @field('deal_date') dealDate!: string | null;
  @field('total_credit') totalCredit!: number;
  @field('remaining_balance') remainingBalance!: number;
  @field('customer_id') customerId!: string;
  @field('codeudor_customer_id') codeudorCustomerId!: string | null;
  @field('direccion') direccion!: string | null;
  @field('municipio_id') municipioId!: string | null;
  @field('municipio_name') municipioName!: string | null;
  @field('seller_id') sellerId!: string | null;
  @field('gestor_cobro_id') gestorCobroId!: string | null;
  @field('sync_status') rowSyncStatus!: string;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class NegocioCuota extends Model {
  static table = 'negocio_cuotas';
  @field('negocio_id') negocioId!: string;
  @field('installment_number') installmentNumber!: number;
  @field('due_date') dueDate!: string;
  @field('amount') amount!: number;
  @field('paid_amount') paidAmount!: number;
  @field('late_fee_amount') lateFeeAmount!: number;
  @field('status') status!: string;
  @field('sync_status') rowSyncStatus!: string;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class NegocioPago extends Model {
  static table = 'negocio_pagos';
  @field('negocio_id') negocioId!: string;
  @field('cuota_id') cuotaId!: string | null;
  @field('amount') amount!: number;
  @field('paid_at') paidAt!: string;
  @field('receipt_number') receiptNumber!: string | null;
  @field('virtual_receipt_number') virtualReceiptNumber!: string | null;
  @field('receipt_status') receiptStatus!: string;
  @field('notes') notes!: string | null;
  @field('created_by_name') createdByName!: string | null;
  @field('sync_status') rowSyncStatus!: string;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class CollectionRouteRecord extends Model {
  static table = 'collection_routes';
  @field('gestor_id') gestorId!: string;
  @field('route_date') routeDate!: string;
  @field('status') status!: string;
  @field('started_at') startedAt!: string | null;
  @field('completed_at') completedAt!: string | null;
  @field('total_expected') totalExpected!: number;
  @field('total_collected') totalCollected!: number;
  @field('sync_status') rowSyncStatus!: string;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class CollectionRouteStopRecord extends Model {
  static table = 'collection_route_stops';
  @field('route_id') routeId!: string;
  @field('negocio_id') negocioId!: string;
  @field('negocio_numero') negocioNumero!: number;
  @field('position') position!: number;
  @field('status') status!: string;
  @field('customer_name') customerName!: string;
  @field('customer_phone') customerPhone!: string | null;
  @field('customer_address') customerAddress!: string;
  @field('municipality_name') municipalityName!: string | null;
  @field('expected_balance') expectedBalance!: number;
  @field('payment_id') paymentId!: string | null;
  @field('payment_amount') paymentAmount!: number | null;
  @field('outcome_reason') outcomeReason!: string | null;
  @field('notes') notes!: string | null;
  @field('arrived_at') arrivedAt!: string | null;
  @field('completed_at') completedAt!: string | null;
  @field('sync_status') rowSyncStatus!: string;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class CatalogMunicipio extends Model {
  static table = 'catalog_municipios';
  @field('nombre') nombre!: string;
  @field('is_active') isActive!: boolean;
}

export class UserProfileCache extends Model {
  static table = 'user_profile_cache';
  @field('user_id') userId!: string;
  @field('roles_json') rolesJson!: string;
  @field('cached_at') cachedAt!: number;
}

export class ReportSnapshot extends Model {
  static table = 'report_snapshots';
  @field('kind') kind!: string;
  @field('payload_json') payloadJson!: string;
  @field('pulled_at') pulledAt!: number;
}

export class SyncOutboxItem extends Model {
  static table = 'sync_outbox';
  @field('type') type!: string;
  @field('payload_json') payloadJson!: string;
  @field('idempotency_key') idempotencyKey!: string;
  @field('status') status!: string;
  @field('attempts') attempts!: number;
  @field('last_error') lastError!: string | null;
  @field('next_retry_at') nextRetryAt!: number;
  @field('created_at') queuedAt!: number;
  @field('result_json') resultJson!: string | null;
}

export class SyncMeta extends Model {
  static table = 'sync_meta';
  @field('key') key!: string;
  @field('value') value!: string;
}

export class FileUpload extends Model {
  static table = 'file_uploads';
  @field('local_uri') localUri!: string;
  @field('mime') mime!: string;
  @field('file_name') fileName!: string;
  @field('bucket') bucket!: string;
  @field('negocio_id') negocioId!: string | null;
  @field('pago_local_id') pagoLocalId!: string | null;
  @field('pago_server_id') pagoServerId!: string | null;
  @field('status') status!: string;
  @field('last_error') lastError!: string | null;
}

export const modelClasses = [
  Customer,
  Negocio,
  NegocioCuota,
  NegocioPago,
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  CatalogMunicipio,
  UserProfileCache,
  ReportSnapshot,
  SyncOutboxItem,
  SyncMeta,
  FileUpload,
];
