/**
 * Cambiar el origen de un borrador de negocio (remisión u orden de entrega).
 *
 * Caso real (negocio 20260449): el vendedor guarda un borrador «desde bodega»
 * y la mercancía le llega después en una remisión. Antes tenía que crear otro
 * negocio; ahora, antes de activar, elige la remisión u OE y el servidor
 * (`change_negocio_draft_source`, migración 20261231570000) cambia el origen y
 * la bodega de cada línea según la orden. Cliente, productos, precios, cuotas
 * y fotos no cambian.
 *
 * Aquí vive la lógica pura: a qué orden se cambia, si trae lo del borrador
 * (producto por producto) y cómo se guarda un cambio preparado sin señal.
 *
 * Sin señal: el cambio se PREPARA en el teléfono, pero no se encola. La
 * remisión puede venderse entre tanto (otro teléfono, otra venta) y un comando
 * encolado activaría o cambiaría a ciegas: al volver la señal el vendedor lo
 * confirma, el servidor revisa lo disponible en ese momento y solo entonces se
 * activa.
 */
import { buildNegocioOriginPayload } from './negocioOrigin';

/** Línea del borrador (con o sin señal: basta producto y cantidad). */
export interface DraftOriginItem {
  product_id: string;
  quantity: number | string;
  product_name?: string | null;
}

/** Línea disponible de la orden elegida (o del grupo de la remisión). */
export interface DraftOriginAvailableItem {
  product_id: string;
  product_name?: string | null;
  available_quantity: number;
}

export interface DraftOriginCoverageLine {
  product_id: string;
  product_name: string;
  requested_quantity: number;
  available_quantity: number;
  missing_quantity: number;
}

export interface DraftOriginCoverage {
  lines: DraftOriginCoverageLine[];
  /** La orden trae todo lo del borrador. */
  complete: boolean;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Por producto: cuánto pide el borrador y cuánto trae la orden (sumando todas
 * sus bodegas, como hace el servidor al repartir la línea).
 */
export function evaluateDraftOriginCoverage(
  draftItems: DraftOriginItem[],
  originItems: DraftOriginAvailableItem[]
): DraftOriginCoverage {
  const available = new Map<string, number>();
  const names = new Map<string, string>();
  for (const item of originItems) {
    if (!item?.product_id) continue;
    available.set(item.product_id, (available.get(item.product_id) || 0) + Math.max(0, toNumber(item.available_quantity)));
    if (item.product_name) names.set(item.product_id, item.product_name);
  }

  const order: string[] = [];
  const requested = new Map<string, number>();
  for (const item of draftItems) {
    if (!item?.product_id) continue;
    if (!requested.has(item.product_id)) order.push(item.product_id);
    requested.set(item.product_id, (requested.get(item.product_id) || 0) + toNumber(item.quantity));
    if (item.product_name && !names.has(item.product_id)) names.set(item.product_id, item.product_name);
  }

  const lines = order.map((productId) => {
    const req = requested.get(productId) || 0;
    const avail = available.get(productId) || 0;
    return {
      product_id: productId,
      product_name: names.get(productId) || 'Producto',
      requested_quantity: req,
      available_quantity: avail,
      missing_quantity: Math.max(0, req - avail),
    };
  });
  return { lines, complete: lines.length > 0 && lines.every((line) => line.missing_quantity === 0) };
}

/** «Mesa: pide 3, hay 1 (faltan 2)» o «Mesa: 3 de 3». */
export function formatCoverageLine(line: DraftOriginCoverageLine): string {
  if (line.missing_quantity <= 0) {
    return `${line.product_name}: ${line.requested_quantity} de ${line.requested_quantity}`;
  }
  const faltan = line.missing_quantity === 1 ? 'falta 1' : `faltan ${line.missing_quantity}`;
  return line.available_quantity <= 0
    ? `${line.product_name}: pide ${line.requested_quantity}, la orden no tiene (${faltan})`
    : `${line.product_name}: pide ${line.requested_quantity}, hay ${line.available_quantity} (${faltan})`;
}

// ---------------------------------------------------------------------------
// Qué órdenes y grupos sirven para ESTE borrador
// ---------------------------------------------------------------------------

export const ORDEN_DE_OTRO_CLIENTE = 'Es de otro cliente: el negocio debe ser del cliente de la orden';
export const GRUPO_CON_NEGOCIO = 'Ya tiene negocio asociado';

/**
 * Una OE de cliente solo sirve si es del mismo cliente del borrador (lo exige
 * el servidor al activar). Una remisión sirve a cualquiera: lo que se decide
 * es el grupo.
 */
export function draftOriginOrderBlockReason(
  order: { order_type: string; customer_id: string | null; unusable_reason?: string | null },
  draftCustomerId: string | null | undefined
): string | null {
  if (order.unusable_reason) return order.unusable_reason;
  if (order.order_type === 'customer' && order.customer_id && draftCustomerId && order.customer_id !== draftCustomerId) {
    return ORDEN_DE_OTRO_CLIENTE;
  }
  return null;
}

export function draftOriginGroupBlockReason(
  group: { kind: 'own' | 'child'; hasNegocio: boolean; customerId: string | null },
  draftCustomerId: string | null | undefined
): string | null {
  if (group.kind !== 'child') return null;
  if (group.hasNegocio) return GRUPO_CON_NEGOCIO;
  if (group.customerId && draftCustomerId && group.customerId !== draftCustomerId) return ORDEN_DE_OTRO_CLIENTE;
  return null;
}

// ---------------------------------------------------------------------------
// Destino del cambio
// ---------------------------------------------------------------------------

export interface DraftOriginTarget {
  /** Remisión (productos propios); null con una OE de cliente. */
  remission_id: string | null;
  /** Remisión (propios) u OE de cliente (suelta o anidada). */
  source_delivery_order_id: string;
  kind: 'remision' | 'orden_cliente';
  /** Texto para la pantalla: «Remisión OE-2026-1 · productos propios». */
  label: string;
}

/**
 * Mismo payload que al crear el negocio (`buildNegocioOriginPayload`): con una
 * remisión hace falta el grupo (propios u OE hija); sin grupo no hay destino.
 */
export function buildDraftOriginTarget(
  order: { id: string; order_type: string; order_number: string } | null | undefined,
  group: { kind: 'own' | 'child'; sourceOrderId: string; label: string } | null | undefined
): DraftOriginTarget | null {
  if (!order) return null;
  if (order.order_type === 'remission' && !group) return null;
  const payload = buildNegocioOriginPayload({
    originType: 'orden_entrega',
    deliveryMode: 'directo',
    targetRemissionId: null,
    selectedOrder: order,
    selectedGroup: group ?? null,
  });
  if (!payload.source_delivery_order_id) return null;
  const isOwn = Boolean(payload.remission_id);
  const label =
    order.order_type === 'remission'
      ? `Remisión ${order.order_number} · ${isOwn ? 'productos propios' : group?.label ?? 'orden anidada'}`
      : `Orden de cliente ${order.order_number}`;
  return {
    remission_id: payload.remission_id,
    source_delivery_order_id: payload.source_delivery_order_id,
    kind: isOwn ? 'remision' : 'orden_cliente',
    label,
  };
}

// ---------------------------------------------------------------------------
// Respuesta de check_negocio_draft_source
// ---------------------------------------------------------------------------

export interface DraftSourceCheck {
  usable: boolean;
  reason: string | null;
  orderNumber: string | null;
  lines: DraftOriginCoverageLine[];
}

export function parseDraftSourceCheck(data: unknown): DraftSourceCheck {
  const row = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const rawLines = Array.isArray(row.lines) ? row.lines : [];
  const lines: DraftOriginCoverageLine[] = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== 'object') continue;
    const line = raw as Record<string, unknown>;
    if (typeof line.product_id !== 'string') continue;
    lines.push({
      product_id: line.product_id,
      product_name: typeof line.product_name === 'string' && line.product_name ? line.product_name : 'Producto',
      requested_quantity: toNumber(line.requested_quantity),
      available_quantity: toNumber(line.available_quantity),
      missing_quantity: toNumber(line.missing_quantity),
    });
  }
  return {
    usable: row.usable === true,
    reason: typeof row.reason === 'string' && row.reason ? row.reason : null,
    orderNumber: typeof row.order_number === 'string' && row.order_number ? row.order_number : null,
    lines,
  };
}

// ---------------------------------------------------------------------------
// Cambio preparado sin señal
// ---------------------------------------------------------------------------

export interface PreparedDraftOriginChange extends DraftOriginTarget {
  negocioId: string;
  /** Clave de idempotencia fija para reintentar la confirmación sin duplicar. */
  idempotencyKey: string;
  preparedAt: string;
}

export const ORIGEN_PREPARADO_SIN_SENAL =
  'Sin señal el cambio queda preparado en este teléfono, pero no se envía solo. Cuando tenga señal, ábralo y pulse «Confirmar cambio»: hay que revisar que la orden siga teniendo los productos. Solo después se puede activar.';

export function parsePreparedDraftOriginChange(raw: string | null | undefined): PreparedDraftOriginChange | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PreparedDraftOriginChange>;
    if (
      !value ||
      typeof value.negocioId !== 'string' ||
      typeof value.source_delivery_order_id !== 'string' ||
      typeof value.idempotencyKey !== 'string'
    ) {
      return null;
    }
    return {
      negocioId: value.negocioId,
      remission_id: typeof value.remission_id === 'string' ? value.remission_id : null,
      source_delivery_order_id: value.source_delivery_order_id,
      kind: value.kind === 'remision' ? 'remision' : 'orden_cliente',
      label: typeof value.label === 'string' ? value.label : 'Orden de entrega',
      idempotencyKey: value.idempotencyKey,
      preparedAt: typeof value.preparedAt === 'string' ? value.preparedAt : '',
    };
  } catch {
    return null;
  }
}

/** Un activar con un cambio preparado pendiente saldría del origen viejo. */
export const CONFIRMA_ORIGEN_ANTES_DE_ACTIVAR =
  'Hay un cambio de origen preparado sin señal. Confírmelo primero («Confirmar cambio») o descártelo; si activa ahora, el negocio saldría del origen anterior.';

/**
 * Un cambio preparado solo tiene sentido mientras el negocio siga en borrador
 * (o por firmar). Activado, anulado o en cualquier otro estado, se borra del
 * teléfono al cargar el detalle. Sin estado conocido no se toca.
 */
export function preparedOriginIsStale(status: string | null | undefined): boolean {
  if (!status) return false;
  return status !== 'borrador' && status !== 'por_firmar';
}
