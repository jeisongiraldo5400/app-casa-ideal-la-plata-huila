/**
 * Reglas puras de despacho, recepción y devolución de traslados (sin React ni
 * Supabase). Replican lo que valida el servidor para avisar antes de enviar;
 * la última palabra la tienen las RPC.
 *
 * Invariante por línea (contrato §1):
 *   dispatched = received + returned + written_off + en_tránsito
 *   received ≤ dispatched ≤ quantity
 *   pendiente de recibir = en_tránsito − return_pending
 */
import { normalizeSerial } from '@/components/inventory-flow/serials';
import type { ReceiverOption, TransferDetail, TransferItem, TransferStatus } from './transferModel';
import type { TransferPhotoDraft } from './transferPhotos';

// ---------------------------------------------------------------------------
// Cantidades
// ---------------------------------------------------------------------------

const nonNegative = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** Lo que salió del origen y aún no se resolvió (incluye lo que va de vuelta). */
export function inTransitOf(item: TransferItem): number {
  return nonNegative(
    item.dispatchedQuantity - item.receivedQuantity - item.returnedQuantity - item.writtenOffQuantity
  );
}

/** Máximo a despachar: lo reservado al enviar a despacho. */
export function maxDispatch(item: TransferItem): number {
  return nonNegative(item.quantity);
}

/** Máximo a recibir: lo que sigue en camino hacia el destino (sin lo que se devuelve). */
export function maxReceive(item: TransferItem): number {
  return nonNegative(inTransitOf(item) - item.returnPendingQuantity);
}

/** Máximo a confirmar como devuelto en el origen. */
export function maxReturn(item: TransferItem): number {
  return nonNegative(item.returnPendingQuantity);
}

/** ¿La línea cumple el invariante del contrato? (sirve para no mostrar datos imposibles). */
export function lineInvariantHolds(item: TransferItem): boolean {
  const inTransit =
    item.dispatchedQuantity - item.receivedQuantity - item.returnedQuantity - item.writtenOffQuantity;
  return (
    inTransit >= 0 &&
    item.receivedQuantity >= 0 &&
    item.receivedQuantity <= item.dispatchedQuantity &&
    item.dispatchedQuantity <= item.quantity &&
    item.returnPendingQuantity <= inTransit &&
    item.dispatchedQuantity ===
      item.receivedQuantity + item.returnedQuantity + item.writtenOffQuantity + inTransit
  );
}

/** Lleva una cantidad escrita al rango [0, max] en unidades enteras. */
export function clampQuantity(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), Math.max(0, Math.floor(max)));
}

// ---------------------------------------------------------------------------
// Seriales (texto libre, sin escáner)
// ---------------------------------------------------------------------------

/** Separa lo escrito en seriales: uno por renglón, o separados por coma / punto y coma. */
export function parseSerialsText(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/[\n,;]+/)
    .map((serial) => serial.trim())
    .filter((serial) => serial.length > 0);
}

/** ¿La línea viaja con seriales en ese estado? (entonces el servidor los exige). */
export function lineNeedsSerials(item: TransferItem, status: 'in_transit' | 'return_pending'): boolean {
  return item.serials.some((serial) => serial.status === status);
}

/**
 * Valida la lista de seriales de una cantidad. `allowed` (normalizados) limita
 * a los que el servidor espera; `taken` son los ya usados en otra parte de la
 * misma línea (p. ej. los de «llegó bien» al revisar los de «averiada»).
 */
export function serialsError(
  serials: string[],
  quantity: number,
  options: { required: boolean; allowed?: Set<string>; taken?: Set<string> }
): string | null {
  if (serials.length === 0) {
    if (options.required && quantity > 0) {
      return `Indica ${quantity} serial(es): uno por unidad.`;
    }
    return null;
  }
  if (serials.length !== quantity) {
    return `Indica un serial por unidad (${quantity} unidad${quantity === 1 ? '' : 'es'}, ${serials.length} serial${serials.length === 1 ? '' : 'es'}).`;
  }
  const seen = new Set<string>();
  for (const serial of serials) {
    const normalized = normalizeSerial(serial);
    if (!normalized) return 'Hay un serial vacío en la lista.';
    if (seen.has(normalized) || options.taken?.has(normalized)) return `El serial ${serial} está repetido.`;
    seen.add(normalized);
    if (options.allowed && !options.allowed.has(normalized)) {
      return `El serial ${serial} no corresponde a las unidades pendientes de este producto.`;
    }
  }
  return null;
}

function serialsWithStatus(item: TransferItem, status: string): Set<string> {
  return new Set(
    item.serials.filter((serial) => serial.status === status).map((serial) => normalizeSerial(serial.serialNumber))
  );
}

// ---------------------------------------------------------------------------
// Borradores
// ---------------------------------------------------------------------------

export type DispatchLineDraft = { quantity: number; serialsText: string };
export type DispatchDraft = {
  kind: 'dispatch';
  lines: Record<string, DispatchLineDraft>;
  /** '' = conservar el transportador del traslado. */
  carrierId: string;
  notes: string;
  /** Foto general opcional de la carga. */
  photo: TransferPhotoDraft | null;
  /** Quiénes pueden recibir en el destino (20261231450000); ≥ 1 para despachar. */
  receiverIds: string[];
};

export type ReceiveLineDraft = {
  ok: number;
  damaged: number;
  okSerialsText: string;
  damagedSerialsText: string;
  /** Foto opcional de la avería (solo se envía si `damaged > 0`). */
  damagedPhoto?: TransferPhotoDraft | null;
};
export type ReceiveDraft = {
  kind: 'receive';
  lines: Record<string, ReceiveLineDraft>;
  reportMissing: boolean;
  notes: string;
  /** Foto general opcional de lo que llegó. */
  photo: TransferPhotoDraft | null;
};

export type ReturnLineDraft = { quantity: number; serialsText: string };
export type ReturnDraft = { kind: 'return'; lines: Record<string, ReturnLineDraft>; notes: string };

export type TransferDraft = DispatchDraft | ReceiveDraft | ReturnDraft;

/** Despachar arranca con todo lo reservado: lo normal es que salga completo. */
export function initialDispatchDraft(detail: TransferDetail): DispatchDraft {
  const lines: Record<string, DispatchLineDraft> = {};
  for (const item of detail.items) lines[item.id] = { quantity: maxDispatch(item), serialsText: '' };
  return {
    kind: 'dispatch',
    lines,
    carrierId: '',
    notes: '',
    photo: null,
    receiverIds: defaultReceiverIds(detail, detail.order.carrier?.id ?? null),
  };
}

// ---------------------------------------------------------------------------
// Receptores al despachar (20261231450000)
// ---------------------------------------------------------------------------

/** Transportador que quedará: el elegido al despachar o el que puso el admin. */
export function effectiveCarrierId(detail: TransferDetail, draft: Pick<DispatchDraft, 'carrierId'>): string | null {
  return draft.carrierId || detail.order.carrier?.id || null;
}

/** Quien despacha y el transportador no pueden recibir: no se ofrecen. */
export function receiverChoices(detail: TransferDetail, carrierId: string | null): ReceiverOption[] {
  return detail.receiverOptions.filter((option) => !option.isMe && option.id !== carrierId);
}

/** Preselección: los encargados del destino que se pueden elegir. */
export function defaultReceiverIds(detail: TransferDetail, carrierId: string | null): string[] {
  return receiverChoices(detail, carrierId)
    .filter((option) => option.isManager)
    .map((option) => option.id);
}

/** Los elegidos que siguen siendo válidos (si cambia el transportador, sale de la lista). */
export function selectedReceivers(detail: TransferDetail, draft: DispatchDraft): ReceiverOption[] {
  const chosen = new Set(draft.receiverIds ?? []);
  return receiverChoices(detail, effectiveCarrierId(detail, draft)).filter((option) => chosen.has(option.id));
}

export function noReceiversMessage(detail: TransferDetail): string {
  return `Elige al menos una persona que pueda recibir en ${detail.order.destinationWarehouse.name}.`;
}

/** Recibir arranca en cero: quien recibe cuenta lo que llegó (no se da por hecho). */
export function initialReceiveDraft(detail: TransferDetail): ReceiveDraft {
  const lines: Record<string, ReceiveLineDraft> = {};
  for (const item of detail.items) {
    if (maxReceive(item) > 0) lines[item.id] = { ok: 0, damaged: 0, okSerialsText: '', damagedSerialsText: '' };
  }
  return { kind: 'receive', lines, reportMissing: false, notes: '', photo: null };
}

export function initialReturnDraft(detail: TransferDetail): ReturnDraft {
  const lines: Record<string, ReturnLineDraft> = {};
  for (const item of detail.items) {
    if (maxReturn(item) > 0) lines[item.id] = { quantity: 0, serialsText: '' };
  }
  return { kind: 'return', lines, notes: '' };
}

/** Marca como recibido en buen estado todo lo pendiente (botón «Llegó todo»). */
export function receiveAllOk(detail: TransferDetail, draft: ReceiveDraft): ReceiveDraft {
  const lines = { ...draft.lines };
  for (const item of detail.items) {
    const current = lines[item.id];
    if (!current) continue;
    lines[item.id] = { ...current, ok: maxReceive(item), damaged: 0 };
  }
  return { ...draft, lines };
}

export function returnAll(detail: TransferDetail, draft: ReturnDraft): ReturnDraft {
  const lines = { ...draft.lines };
  for (const item of detail.items) {
    const current = lines[item.id];
    if (current) lines[item.id] = { ...current, quantity: maxReturn(item) };
  }
  return { ...draft, lines };
}

/**
 * Un borrador guardado solo sirve si sigue calzando con el traslado (mismas
 * líneas y cantidades dentro de los nuevos máximos); si no, se descarta.
 */
export function draftFitsDetail(draft: TransferDraft, detail: TransferDetail): boolean {
  const byId = new Map(detail.items.map((item) => [item.id, item]));
  for (const [itemId, line] of Object.entries(draft.lines)) {
    const item = byId.get(itemId);
    if (!item) return false;
    if (draft.kind === 'dispatch' && (line as DispatchLineDraft).quantity > maxDispatch(item)) return false;
    if (draft.kind === 'receive') {
      const receive = line as ReceiveLineDraft;
      if (receive.ok + receive.damaged > maxReceive(item)) return false;
    }
    if (draft.kind === 'return' && (line as ReturnLineDraft).quantity > maxReturn(item)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Validación + carga útil de las RPC
// ---------------------------------------------------------------------------

export type DispatchPayloadItem = { item_id: string; quantity: number; serials?: string[] };
export type ReceivePayloadItem = {
  item_id: string;
  quantity: number;
  condition: 'ok' | 'damaged';
  serials?: string[];
  /** Foto de la avería (migración 20261231350000); solo en `damaged`. */
  photo_path?: string;
};
export type ReturnPayloadItem = { item_id: string; quantity: number; serials?: string[] };

export type Validation<T, S> =
  | { ok: true; items: T[]; summary: S }
  | { ok: false; lineErrors: Record<string, string>; message: string };

export type DispatchSummary = {
  units: number;
  lines: number;
  released: number;
  receiverIds: string[];
  receiverNames: string[];
};

export function validateDispatch(
  detail: TransferDetail,
  draft: DispatchDraft
): Validation<DispatchPayloadItem, DispatchSummary> {
  const lineErrors: Record<string, string> = {};
  const items: DispatchPayloadItem[] = [];
  let units = 0;
  let released = 0;
  for (const item of detail.items) {
    const line = draft.lines[item.id] ?? { quantity: 0, serialsText: '' };
    const max = maxDispatch(item);
    const quantity = line.quantity;
    if (!Number.isInteger(quantity) || quantity < 0) {
      lineErrors[item.id] = 'La cantidad debe ser un número entero';
      continue;
    }
    if (quantity > max) {
      lineErrors[item.id] = `No puedes despachar ${quantity}: el traslado reservó ${max}.`;
      continue;
    }
    released += max - quantity;
    if (quantity === 0) continue;
    const serials = parseSerialsText(line.serialsText);
    const serialError = serialsError(serials, quantity, { required: false });
    if (serialError) {
      lineErrors[item.id] = serialError;
      continue;
    }
    units += quantity;
    items.push(serials.length ? { item_id: item.id, quantity, serials } : { item_id: item.id, quantity });
  }
  if (Object.keys(lineErrors).length) {
    return { ok: false, lineErrors, message: 'Revisa las líneas marcadas en rojo.' };
  }
  if (units === 0) {
    return {
      ok: false,
      lineErrors,
      message: 'Marca al menos una unidad para despachar (o pide en la web que cancelen el traslado).',
    };
  }
  const receivers = selectedReceivers(detail, draft);
  if (receivers.length === 0) {
    return { ok: false, lineErrors, message: noReceiversMessage(detail) };
  }
  return {
    ok: true,
    items,
    summary: {
      units,
      lines: items.length,
      released,
      receiverIds: receivers.map((receiver) => receiver.id),
      receiverNames: receivers.map((receiver) => receiver.name),
    },
  };
}

export type ReceiveSummary = {
  ok: number;
  damaged: number;
  /** Lo que seguirá en camino después de esta recepción. */
  remaining: number;
  reportMissing: boolean;
};

export function validateReceive(
  detail: TransferDetail,
  draft: ReceiveDraft
): Validation<ReceivePayloadItem, ReceiveSummary> {
  const lineErrors: Record<string, string> = {};
  const items: ReceivePayloadItem[] = [];
  let okTotal = 0;
  let damagedTotal = 0;
  let pendingTotal = 0;
  for (const item of detail.items) {
    const max = maxReceive(item);
    pendingTotal += max;
    const line = draft.lines[item.id];
    if (!line || max === 0) continue;
    const { ok, damaged } = line;
    if (![ok, damaged].every((value) => Number.isInteger(value) && value >= 0)) {
      lineErrors[item.id] = 'La cantidad debe ser un número entero';
      continue;
    }
    if (ok + damaged > max) {
      lineErrors[item.id] = `No puedes recibir ${ok + damaged}: quedan ${max} por recibir.`;
      continue;
    }
    const required = lineNeedsSerials(item, 'in_transit');
    let okSerials: string[] = [];
    let damagedSerials: string[] = [];
    if (required) {
      const allowed = serialsWithStatus(item, 'in_transit');
      okSerials = parseSerialsText(line.okSerialsText);
      damagedSerials = parseSerialsText(line.damagedSerialsText);
      const okError = serialsError(okSerials, ok, { required, allowed });
      const damagedError =
        okError ??
        serialsError(damagedSerials, damaged, {
          required,
          allowed,
          taken: new Set(okSerials.map(normalizeSerial)),
        });
      if (okError || damagedError) {
        lineErrors[item.id] = (okError ?? damagedError) as string;
        continue;
      }
    }
    if (ok > 0) items.push({ item_id: item.id, quantity: ok, condition: 'ok', ...(required ? { serials: okSerials } : {}) });
    if (damaged > 0) {
      items.push({ item_id: item.id, quantity: damaged, condition: 'damaged', ...(required ? { serials: damagedSerials } : {}) });
    }
    okTotal += ok;
    damagedTotal += damaged;
  }
  if (Object.keys(lineErrors).length) {
    return { ok: false, lineErrors, message: 'Revisa las líneas marcadas en rojo.' };
  }
  if (okTotal + damagedTotal === 0 && !draft.reportMissing) {
    return {
      ok: false,
      lineErrors,
      message: 'Marca al menos una unidad recibida (o informa que no llegó el resto).',
    };
  }
  return {
    ok: true,
    items,
    summary: {
      ok: okTotal,
      damaged: damagedTotal,
      remaining: Math.max(0, pendingTotal - okTotal - damagedTotal),
      reportMissing: draft.reportMissing,
    },
  };
}

export type ReturnSummary = { units: number; remaining: number };

export function validateReturn(
  detail: TransferDetail,
  draft: ReturnDraft
): Validation<ReturnPayloadItem, ReturnSummary> {
  const lineErrors: Record<string, string> = {};
  const items: ReturnPayloadItem[] = [];
  let units = 0;
  let pending = 0;
  for (const item of detail.items) {
    const max = maxReturn(item);
    pending += max;
    const line = draft.lines[item.id];
    if (!line || max === 0) continue;
    const { quantity } = line;
    if (!Number.isInteger(quantity) || quantity < 0) {
      lineErrors[item.id] = 'La cantidad debe ser un número entero';
      continue;
    }
    if (quantity > max) {
      lineErrors[item.id] = `No puedes confirmar ${quantity}: se mandaron devolver ${max}.`;
      continue;
    }
    if (quantity === 0) continue;
    const required = lineNeedsSerials(item, 'return_pending');
    const serials = required ? parseSerialsText(line.serialsText) : [];
    if (required) {
      const error = serialsError(serials, quantity, { required, allowed: serialsWithStatus(item, 'return_pending') });
      if (error) {
        lineErrors[item.id] = error;
        continue;
      }
    }
    units += quantity;
    items.push(required ? { item_id: item.id, quantity, serials } : { item_id: item.id, quantity });
  }
  if (Object.keys(lineErrors).length) {
    return { ok: false, lineErrors, message: 'Revisa las líneas marcadas en rojo.' };
  }
  if (units === 0) return { ok: false, lineErrors, message: 'Marca al menos una unidad devuelta.' };
  return { ok: true, items, summary: { units, remaining: Math.max(0, pending - units) } };
}

// ---------------------------------------------------------------------------
// Modos de la pantalla de detalle
// ---------------------------------------------------------------------------

export type TransferMode = 'dispatch' | 'receive' | 'return' | 'view';

/** Estados con unidades en camino hacia el destino. */
export const RECEIVABLE: readonly TransferStatus[] = ['in_transit', 'partially_received', 'with_differences'];

/** Acciones que el usuario puede hacer ahora sobre el traslado (según estado y `permissions`). */
export function availableModes(detail: TransferDetail): TransferMode[] {
  const { order, permissions, items } = detail;
  const modes: TransferMode[] = [];
  if (order.status === 'pending_dispatch' && permissions.canDispatch) modes.push('dispatch');
  if (RECEIVABLE.includes(order.status) && permissions.canReceive && items.some((item) => maxReceive(item) > 0)) {
    modes.push('receive');
  }
  if (permissions.canConfirmReturn && items.some((item) => maxReturn(item) > 0)) modes.push('return');
  return modes;
}

/** Modo inicial: el pedido (desde la lista o el aviso) si se puede; si no, el primero disponible. */
export function initialMode(detail: TransferDetail, preferred?: TransferMode | null): TransferMode {
  const modes = availableModes(detail);
  if (preferred && modes.includes(preferred)) return preferred;
  return modes[0] ?? 'view';
}

/** `?modo=` de la ruta → modo. */
export function parseModeParam(value: unknown): TransferMode | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === 'despachar') return 'dispatch';
  if (text === 'recibir') return 'receive';
  if (text === 'devolucion') return 'return';
  return null;
}

export function modeParam(mode: Exclude<TransferMode, 'view'>): string {
  return mode === 'dispatch' ? 'despachar' : mode === 'receive' ? 'recibir' : 'devolucion';
}
