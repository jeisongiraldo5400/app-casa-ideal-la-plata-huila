import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class Customer extends Model {
  static table = 'customers';
  @field('name') name!: string;
  @field('id_number') idNumber!: string;
  @field('phone') phone!: string | null;
  @field('seller_id') sellerId!: string | null;
  @field('phone_secondary') phoneSecondary!: string | null;
  @field('email') email!: string | null;
  @field('address') address!: string | null;
  @field('municipio_id') municipioId!: string | null;
  @field('vereda_id') veredaId!: string | null;
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
  /** Nombre del vendedor ya resuelto por el servidor (null en filas anteriores a v8). */
  @field('seller_name') sellerName!: string | null;
  @field('gestor_cobro_name') gestorCobroName!: string | null;
  /** Motivo con el que el servidor rechazó el negocio creado sin señal. */
  @field('rejected_reason') rejectedReason!: string | null;
  @field('rejected_at') rejectedAt!: number | null;
  /** Quién registró el negocio y su nombre ya resuelto (null en filas anteriores a v10). */
  @field('created_by') createdBy!: string | null;
  @field('created_by_name') createdByName!: string | null;
  /** 'synced' | 'pending' (creado sin señal, sin confirmar) | 'rejected'. */
  @field('sync_status') rowSyncStatus!: string;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class NegocioItem extends Model {
  static table = 'negocio_items';
  @field('negocio_id') negocioId!: string;
  @field('product_id') productId!: string;
  @field('product_name') productName!: string | null;
  @field('product_sku') productSku!: string | null;
  @field('warehouse_id') warehouseId!: string | null;
  @field('description') description!: string | null;
  @field('quantity') quantity!: number;
  @field('unit_price') unitPrice!: number;
  @field('subtotal') subtotal!: number;
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
  @field('payment_method_id') paymentMethodId!: string | null;
  @field('payment_method_name') paymentMethodName!: string | null;
  @field('payment_site') paymentSite!: string | null;
  /** 'abono' | 'pronto_pago'; null en filas descargadas antes de la versión 6. */
  @field('payment_kind') paymentKind!: string | null;
  /** Descuento por pronto pago (no es dinero recibido). */
  @field('discount_amount') discountAmount!: number | null;
  @field('discount_reason') discountReason!: string | null;
  /** Pendiente total que liquidó el pronto pago (= amount + discount_amount). */
  @field('expected_total') expectedTotal!: number | null;
  /** Motivo con el que el servidor rechazó el pago (solo si `rowSyncStatus` es 'rejected'). */
  @field('rejected_reason') rejectedReason!: string | null;
  @field('rejected_at') rejectedAt!: number | null;
  /** 'synced' | 'pending' | 'rejected' (local: el servidor no aceptó el pago). */
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

export class CatalogPaymentMethod extends Model {
  static table = 'catalog_payment_methods';
  @field('name') name!: string;
}

export class CatalogMunicipio extends Model {
  static table = 'catalog_municipios';
  @field('nombre') nombre!: string;
  @field('is_active') isActive!: boolean;
  @field('departamento_id') departamentoId!: string | null;
}

export class CatalogVereda extends Model {
  static table = 'catalog_veredas';
  @field('nombre') nombre!: string;
  @field('municipio_id') municipioId!: string;
  @field('is_active') isActive!: boolean;
}

export class CatalogDepartamento extends Model {
  static table = 'catalog_departamentos';
  @field('nombre') nombre!: string;
  @field('is_active') isActive!: boolean;
}

/**
 * Catálogo de producto de la última descarga (v9). Se baja aparte del resto
 * del paquete porque pesa: ver `catalogPull.ts`.
 */
export class CatalogProduct extends Model {
  static table = 'catalog_products';
  @field('name') name!: string;
  @field('sku') sku!: string | null;
  @field('barcode') barcode!: string | null;
  @field('category_id') categoryId!: string | null;
  @field('brand_id') brandId!: string | null;
  @field('status') status!: boolean;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

export class CatalogWarehouse extends Model {
  static table = 'catalog_warehouses';
  @field('name') name!: string;
  @field('city') city!: string | null;
  @field('is_active') isActive!: boolean;
}

/** Existencias de la última descarga; nunca son las de este instante. */
export class CatalogWarehouseStock extends Model {
  static table = 'catalog_warehouse_stock';
  @field('product_id') productId!: string;
  @field('warehouse_id') warehouseId!: string;
  @field('quantity') quantity!: number;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}

/** Usuario de la plataforma; el id de la fila es el id del perfil. */
export class Profile extends Model {
  static table = 'profiles';
  @field('full_name') fullName!: string | null;
  @field('email') email!: string | null;
}

/** Fila activa de `credit_settings`; se guarda una sola. */
export class CreditSettingsRecord extends Model {
  static table = 'credit_settings';
  @field('formula_type') formulaType!: string;
  @field('interest_rate_monthly_pct') interestRateMonthlyPct!: number;
  @field('rounding_unit') roundingUnit!: number;
  @field('late_fee_rate_pct') lateFeeRatePct!: number;
  @field('money_decimal_places') moneyDecimalPlaces!: number;
  @field('min_installments') minInstallments!: number;
  @field('max_installments') maxInstallments!: number;
  @field('default_frequency') defaultFrequency!: string;
  @field('legal_text') legalText!: string | null;
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

/**
 * Orden de entrega llevada en el teléfono (v11). Es la foto de la última
 * descarga: se reemplaza entera en cada pull que la trae.
 */
export class DeliveryOrderLocal extends Model {
  static table = 'delivery_orders_local';
  @field('order_number') orderNumber!: string | null;
  /** 'customer' | 'remission'. */
  @field('order_type') orderType!: string;
  @field('status') status!: string;
  @field('customer_id') customerId!: string | null;
  @field('customer_name') customerName!: string | null;
  @field('municipio_id') municipioId!: string | null;
  @field('vereda_id') veredaId!: string | null;
  @field('delivery_address') deliveryAddress!: string | null;
  /** false si ya no sirve como origen (cancelada, vinculada…); ver `unusableReason`. */
  @field('usable') usable!: boolean;
  @field('unusable_reason') unusableReason!: string | null;
  @field('snapshot_at') snapshotAt!: number | null;
}

/** Línea de una orden llevada, por grupo de origen (v11). */
export class DeliveryOrderLine extends Model {
  static table = 'delivery_order_lines';
  @field('order_id') orderId!: string;
  @field('position') position!: number;
  /** 'own' | 'child' | 'self'. */
  @field('group_kind') groupKind!: string;
  @field('source_order_id') sourceOrderId!: string | null;
  @field('source_order_number') sourceOrderNumber!: string | null;
  @field('source_customer_id') sourceCustomerId!: string | null;
  @field('source_customer_name') sourceCustomerName!: string | null;
  @field('source_has_negocio') sourceHasNegocio!: boolean;
  @field('product_id') productId!: string;
  @field('product_name') productName!: string | null;
  @field('product_sku') productSku!: string | null;
  @field('warehouse_id') warehouseId!: string;
  @field('warehouse_name') warehouseName!: string | null;
  @field('quantity') quantity!: number;
  @field('available_quantity') availableQuantity!: number;
}

/** Remisión pendiente, destino posible de «Enviar en remisión» (v11). */
export class PendingRemission extends Model {
  static table = 'pending_remissions';
  @field('order_number') orderNumber!: string | null;
  @field('status') status!: string;
  @field('remission_created_at') remissionCreatedAt!: string | null;
  @field('assigned_user_id') assignedUserId!: string | null;
  @field('assigned_user_name') assignedUserName!: string | null;
  @field('driver_name') driverName!: string | null;
  @field('zone_name') zoneName!: string | null;
  @field('nested_orders_count') nestedOrdersCount!: number;
}

export const modelClasses = [
  Customer,
  Negocio,
  NegocioItem,
  NegocioCuota,
  NegocioPago,
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  CatalogMunicipio,
  CatalogVereda,
  CatalogDepartamento,
  CatalogPaymentMethod,
  CatalogProduct,
  CatalogWarehouse,
  CatalogWarehouseStock,
  Profile,
  CreditSettingsRecord,
  UserProfileCache,
  ReportSnapshot,
  SyncOutboxItem,
  SyncMeta,
  FileUpload,
  DeliveryOrderLocal,
  DeliveryOrderLine,
  PendingRemission,
];
