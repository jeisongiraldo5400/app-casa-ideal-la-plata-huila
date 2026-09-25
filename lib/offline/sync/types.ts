export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error' | 'rejected';

/**
 * Estado local de un pago que el servidor no aceptó. No se borra la fila: el
 * cliente ya se llevó el recibo impreso, así que el pago queda visible en el
 * negocio, marcado y con el motivo, hasta que la persona decida eliminarlo.
 */
export const REJECTED_ROW_SYNC_STATUS = 'rejected';

export type OutboxCommandType =
  | 'create_customer'
  | 'register_pago'
  | 'register_route_pago'
  | 'update_route_stop'
  | 'start_route'
  | 'finish_route'
  | 'select_route_stop'
  | 'attach_pago_support'
  // Negocio creado sin señal: primero viajan sus firmas y después el RPC
  // `create_negocio` tal cual se habría enviado con red.
  | 'upload_negocio_signature'
  | 'create_negocio';

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
  /** Dirección de la vivienda; opcional, igual que el municipio y la vereda. */
  address?: string | null;
  municipioId?: string | null;
  veredaId?: string | null;
};

export type RegisterPagoPayload = OutboxPayloadBase & {
  pagoLocalId: string;
  /** Método de pago elegido; obligatorio en la pantalla de cobro. */
  paymentMethodId?: string | null;
  /** Sitio de pago; siempre 'app_movil' desde esta app. Ausente en comandos encolados por versiones anteriores. */
  paymentSite?: string | null;
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

/** Rol de cada firma del contrato; el mismo que usa Storage. */
export type NegocioSignatureRole = 'cliente' | 'fiador' | 'vendedor';

/**
 * Firma capturada sin señal. Viaja antes que el negocio y en su mismo carril:
 * la ruta de Storage se decide al encolar, así que el `p_negocio` del RPC (y
 * por tanto el hash de idempotencia) ya no cambia entre reintentos.
 */
export type UploadNegocioSignaturePayload = OutboxPayloadBase & {
  fileUploadId: string;
  negocioId: string;
  role: NegocioSignatureRole;
  /** Ruta definitiva dentro del bucket de firmas. */
  storagePath: string;
};

/**
 * Creación de negocio sin señal. Guarda los argumentos del RPC tal cual: al
 * volver la red se reenvían sin recalcular nada. El servidor recibe siempre el
 * mismo `p_negocio_id` y la misma `p_idempotency_key`, así que un reintento no
 * duplica el negocio.
 */
export type CreateNegocioPayload = OutboxPayloadBase & {
  negocioId: string;
  /** Sin señal siempre false: activar mueve stock y eso exige servidor. */
  activate: boolean;
  negocio: Record<string, unknown>;
  items: Record<string, unknown>[];
  /** Resumen para la cola y para el aviso de rechazo. */
  customerId: string;
  customerName: string;
  totalCredit: number;
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
    // Firmas y negocio comparten carril para que las firmas suban primero.
    case 'upload_negocio_signature':
    case 'create_negocio':
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
  seller_id: string | null;
  /**
   * Contacto y ubicación (20261122120000). Opcionales: un servidor anterior a
   * esa migración no los envía y la ficha sigue mostrando lo que sí llegó.
   */
  phone_secondary?: string | null;
  email?: string | null;
  address?: string | null;
  municipio_id?: string | null;
  vereda_id?: string | null;
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
  /** Nombres ya resueltos por el servidor (20261122120000); opcionales. */
  seller_name?: string | null;
  gestor_cobro_name?: string | null;
  /** Quién registró el negocio, con su nombre resuelto (20261128120000); opcionales. */
  created_by?: string | null;
  created_by_name?: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

/** Producto de un negocio, con nombre y SKU ya resueltos por el servidor. */
export type PullNegocioItem = {
  id: string;
  negocio_id: string;
  product_id: string;
  product_name: string | null;
  product_sku: string | null;
  warehouse_id: string | null;
  description: string | null;
  quantity: number | string;
  unit_price: number | string;
  subtotal: number | string;
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
  payment_method_id?: string | null;
  payment_method_name?: string | null;
  payment_site?: string | null;
  /**
   * Pronto pago (20261023120000). Opcionales: un servidor anterior a esa
   * migración no los envía y los pagos se tratan como abonos sin descuento.
   */
  payment_kind?: string | null;
  discount_amount?: number | string | null;
  discount_reason?: string | null;
  expected_total?: number | string | null;
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

export type PullMunicipio = {
  id: string;
  nombre: string;
  is_active: boolean;
  /** Departamento al que pertenece (20261122120000); opcional. */
  departamento_id?: string | null;
};
export type PullVereda = { id: string; nombre: string; municipio_id: string; is_active: boolean };
export type PullDepartamento = { id: string; nombre: string; is_active: boolean };
export type PullPaymentMethod = { id: string; name: string };
export type PullProfile = { id: string; full_name: string | null; email: string | null };
export type PullCreditSettings = {
  id: string;
  formula_type: string;
  interest_rate_monthly_pct: number | string;
  rounding_unit: number | string;
  late_fee_rate_pct: number | string;
  money_decimal_places: number | string;
  min_installments: number | string;
  max_installments: number | string;
  default_frequency: string;
  legal_text: string | null;
  is_active: boolean;
};
export type PullRole = { id: string; role_id: string; nombre: string };

/**
 * Catálogo de producto (20261122120000). Sólo viaja si se pide con
 * `p_include_catalog = true`: son ~1,4 MB en la primera bajada.
 */
export type PullProduct = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  category_id: string | null;
  brand_id: string | null;
  status: boolean;
  updated_at: string | null;
};
export type PullWarehouse = {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
};
export type PullWarehouseStock = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number | string;
  updated_at: string | null;
};

/** Dominios que la persona elige qué llevar en el teléfono (20261130120000). */
export type SelectiveDomain = 'clientes' | 'productos';
export const SELECTIVE_DOMAINS: SelectiveDomain[] = ['clientes', 'productos'];
/** Clientes: 'todo' (v3; 'seleccion' sólo en lo que guardó v2). Productos: 'todo' | 'ninguno'. */
export type SyncDomainMode = 'todo' | 'seleccion' | 'ninguno';

/** Preferencias vigentes en el servidor, tal como llegan en `sync_config`. */
export type PullSyncConfig = {
  clientes?: {
    mode?: string | null;
    revision?: number | string | null;
    count?: number | null;
  } | null;
  productos?: { mode?: string | null; revision?: number | string | null; count?: number | null } | null;
  ordenes?: { revision?: number | string | null; count?: number | null } | null;
};

/** `p_options` de `pull_mobile_sync` (20261130140000). */
export type PullOptions = {
  full_domains: SelectiveDomain[];
  orders: boolean;
};

/** Línea de una orden llevada (`delivery_orders_snapshot[].lines[]`). */
export type PullOfflineOrderLine = {
  group_kind: string;
  source_order_id?: string | null;
  /** Alias con el que `get_remission_origin_products` nombra el mismo dato. */
  source_delivery_order_id?: string | null;
  source_order_number?: string | null;
  source_customer_id?: string | null;
  source_customer_name?: string | null;
  source_has_negocio?: boolean | null;
  product_id: string;
  product_name?: string | null;
  product_sku?: string | null;
  warehouse_id: string;
  warehouse_name?: string | null;
  quantity: number | string;
  available_quantity: number | string;
};

/** Orden marcada «Llevar en el teléfono», recalculada entera en cada pull. */
export type PullOfflineOrder = {
  id: string;
  order_number: string | null;
  order_type: string;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  municipio_id?: string | null;
  vereda_id?: string | null;
  delivery_address?: string | null;
  created_at?: string | null;
  customer_id_number?: string | null;
  assigned_user_name?: string | null;
  zone_name?: string | null;
  notes?: string | null;
  usable: boolean;
  unusable_reason?: string | null;
  lines?: PullOfflineOrderLine[] | null;
};

/**
 * Remisión pendiente (lista ligera y completa), tal como la manda
 * 20261130140000. No hay conductor en el servidor. Se aceptan también los
 * nombres de columna con los que el servidor expone lo mismo en otras funciones.
 */
export type PullPendingRemission = {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string | null;
  assigned_user_id?: string | null;
  assigned_to_user_id?: string | null;
  assigned_user_name?: string | null;
  assigned_to_name?: string | null;
  zone_name?: string | null;
  notes?: string | null;
  nested_orders_count?: number | string | null;
  child_orders_count?: number | string | null;
  orders_count?: number | string | null;
};

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
  payment_methods?: CollectionChanges<PullPaymentMethod>;
  /**
   * Colecciones de 20261122120000. Todas opcionales: la app tiene que seguir
   * sincronizando contra un servidor que todavía no tenga esa migración.
   */
  negocio_items?: CollectionChanges<PullNegocioItem>;
  veredas?: CollectionChanges<PullVereda>;
  departamentos?: CollectionChanges<PullDepartamento>;
  profiles?: CollectionChanges<PullProfile>;
  credit_settings?: CollectionChanges<PullCreditSettings>;
  /**
   * Catálogo de producto: sólo llega cuando se pidió. `catalog_included` dice
   * si este paquete lo trae; sin esa marca, que falten `products` no significa
   * «no hubo novedades» sino «no se pidió», y el cursor del catálogo no debe
   * avanzar.
   */
  catalog_included?: boolean;
  /**
   * Alcance que aplicó el servidor (20261128120000). 'cobro' = recaudador puro:
   * sólo bajan los clientes de sus negocios y nunca el catálogo. Ausente en un
   * servidor anterior a esa migración.
   */
  pull_scope?: PullScope;
  products?: CollectionChanges<PullProduct>;
  warehouses?: CollectionChanges<PullWarehouse>;
  warehouse_stock?: CollectionChanges<PullWarehouseStock>;
  /**
   * Descarga selectiva (20261130140000). Todas opcionales: sin `p_options`, o
   * con un servidor anterior, no llegan y la app sigue como antes.
   */
  sync_config?: PullSyncConfig | null;
  /** true si el servidor aplicó lo elegido (la llamada llevó `p_options`). */
  selective_applied?: boolean | null;
  /**
   * Dominios que vinieron COMPLETOS: sólo para ellos, y sólo si el paquete no
   * vino recortado, se borra lo `synced` que no llegó.
   */
  full_domains_sent?: string[] | null;
  pending_remissions?: PullPendingRemission[] | null;
  delivery_orders_snapshot?: PullOfflineOrder[] | null;
  snapshot_at?: string | null;
};

/**
 * Aviso cuando el servidor recortó la descarga por el tope de negocios.
 *
 * Antes esto lanzaba y el paquete entero se descartaba: un gestor con más
 * negocios que el tope se quedaba con el teléfono vacío, que es peor que
 * tenerlo incompleto. Ahora se aplica lo que sí llegó (el servidor manda los
 * negocios con actividad más reciente) y se devuelve el aviso para mostrarlo.
 * `null` si la descarga vino completa.
 */
export function pullTruncationWarning(payload: PullPayload, limit: number): string | null {
  if (!payload.truncated) return null;
  return `Descarga incompleta: solo caben ${limit} negocios. Se guardaron los de actividad más reciente; el resto no está en el teléfono.`;
}

/** Fecha y hora sin zona (columnas `timestamp without time zone`, p. ej. `products.updated_at`). */
const NAIVE_DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Milisegundos de una fecha del servidor. Las columnas sin zona horaria llegan
 * sin desfase y el servidor las guarda en UTC; `Date.parse` las tomaría como
 * hora local del teléfono (5 h de error en Colombia), así que se leen en UTC.
 */
export function toEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = NAIVE_DATE_TIME.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const parsed = Date.parse(text);
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

/**
 * Versión de los campos del pull que se guardan localmente. El pull es delta
 * (`last_pulled_at`): al añadir columnas, las filas descargadas antes quedarían
 * sin ellas hasta que el servidor las vuelva a tocar. Subir esta versión fuerza
 * una descarga completa una sola vez tras actualizar la app.
 *
 * 6: pagos con `payment_kind`, `discount_amount`, `discount_reason` y
 * `expected_total` (pronto pago). Sin esto, un pronto pago descargado por la
 * versión anterior dejaría mal el saldo de los recibos reimpresos.
 *
 * 7: perfiles, productos del negocio, veredas, departamentos, configuración de
 * crédito, nombres de vendedor/gestor y el directorio completo de clientes con
 * contacto y ubicación (20261122120000).
 *
 * 8: quién creó el negocio (`created_by`, `created_by_name`, 20261128120000),
 * para el «CREADO POR» del contrato impreso sin señal.
 *
 * 9: descarga selectiva (20261130140000): `p_options`, `sync_config`, foto de
 * órdenes llevadas y remisiones pendientes. La descarga completa única deja
 * el teléfono coherente con las preferencias de la persona.
 */
export const PULL_PAYLOAD_VERSION = '9';
export const PULL_PAYLOAD_VERSION_META_KEY = 'pull_payload_version';

export type PullScope = 'cobro' | 'completo';

/** Alcance con el que se hizo la última descarga (ver `pull_scope`). */
export const PULL_SCOPE_META_KEY = 'pull_scope';

/**
 * Valor que se guarda en la versión del paquete cuando cambió el alcance: no
 * coincide con ninguna versión real, así que la próxima descarga es completa.
 */
export const PULL_SCOPE_CHANGED_MARKER = 'alcance-cambiado';

/**
 * ¿Cambió el alcance entre la descarga anterior y esta? Pasa cuando a alguien
 * le dan o le quitan un rol: el recaudador puro que pasa a ser vendedor
 * necesita el directorio completo, y el cursor delta sólo traería lo que
 * cambió desde ayer. Sin alcance anterior (primera descarga, o servidor sin
 * 20261128120000) no hay cambio que detectar.
 */
export function pullScopeChanged(
  storedScope: string | null,
  receivedScope: string | null | undefined
): boolean {
  return Boolean(storedScope && receivedScope && storedScope !== receivedScope);
}

export function pullCursorForPayloadVersion(
  storedCursor: string | null,
  storedVersion: string | null,
  currentVersion: string = PULL_PAYLOAD_VERSION
): string | null {
  return storedVersion === currentVersion ? storedCursor : null;
}
