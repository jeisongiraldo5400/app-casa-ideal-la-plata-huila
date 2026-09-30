import { formatPaymentDateTime } from '@/lib/localDate';
import type { PrintCopyInfo } from '@/lib/printCopy';

/**
 * Reglas puras del registro de impresiones (`register_negocio_print`,
 * 20261231300000). La n.º 1 es el original; desde la 2, copia.
 */

export type NegocioPrintDocument = 'contrato' | 'recibo';
export type NegocioPrintFormat = 'pdf' | 'ticket';

export type NegocioPrintEvent = {
  id: string;
  document: NegocioPrintDocument;
  copyNumber: number;
  printedAt: string;
  printedByName: string | null;
  pagoId: string | null;
};

/** Mayor número de copia conocido en el teléfono, por documento. */
export type PrintCopyCache = Record<string, number>;

/**
 * Llave del documento: el contrato del negocio o el recibo de un pago. Un pago
 * sin señal todavía no tiene id del servidor: se identifica por su llave de
 * idempotencia.
 */
export function printCopyKey(input: {
  negocioId: string;
  document: NegocioPrintDocument;
  pagoId?: string | null;
  pagoIdempotencyKey?: string | null;
}): string {
  const pago = input.document === 'recibo' ? input.pagoId || input.pagoIdempotencyKey || '' : '';
  return `${input.negocioId}:${input.document}:${pago}`;
}

/** Número que imprime el teléfono sin señal: el mayor que conoce + 1. */
export function nextOfflineCopyNumber(cache: PrintCopyCache, key: string): number {
  return Math.max(0, Number(cache[key]) || 0) + 1;
}

/** Recuerda un número ya impreso (nunca baja). */
export function rememberCopyNumber(cache: PrintCopyCache, key: string, copyNumber: number): PrintCopyCache {
  const current = Number(cache[key]) || 0;
  if (copyNumber <= current) return cache;
  return { ...cache, [key]: copyNumber };
}

/** Siembra la caché con el historial del servidor. */
export function mergeHistoryIntoCache(
  cache: PrintCopyCache,
  negocioId: string,
  events: NegocioPrintEvent[]
): PrintCopyCache {
  let next = cache;
  for (const event of events) {
    const key = printCopyKey({ negocioId, document: event.document, pagoId: event.pagoId });
    next = rememberCopyNumber(next, key, event.copyNumber);
  }
  return next;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** Respuesta de `register_negocio_print`; null si no trae un número válido. */
export function parseRegisterPrintResponse(data: unknown, fallbackPrintedAt: string): PrintCopyInfo | null {
  const row = asRecord(data);
  const number = Number(row?.copy_number);
  if (!row || !Number.isFinite(number) || number < 1) return null;
  return {
    number,
    printedAt: str(row.printed_at) ?? fallbackPrintedAt,
    printedBy: str(row.printed_by_name),
  };
}

/** Filas de `get_negocio_print_history`. */
export function parsePrintHistory(data: unknown): NegocioPrintEvent[] {
  if (!Array.isArray(data)) return [];
  const events: NegocioPrintEvent[] = [];
  for (const raw of data) {
    const row = asRecord(raw);
    const id = str(row?.id);
    const printedAt = str(row?.printed_at);
    const document = row?.document === 'contrato' || row?.document === 'recibo' ? row.document : null;
    if (!row || !id || !printedAt || !document) continue;
    events.push({
      id,
      document,
      copyNumber: Math.max(1, Number(row.copy_number) || 1),
      printedAt,
      printedByName: str(row.printed_by_name),
      pagoId: str(row.pago_id),
    });
  }
  return events;
}

export type ContractPrintSummary = { count: number; last: NegocioPrintEvent | null };

/** Impresiones del contrato; `events` viene del más reciente al más antiguo. */
export function summarizeContractPrints(events: NegocioPrintEvent[]): ContractPrintSummary {
  const contracts = events.filter((event) => event.document === 'contrato');
  return { count: contracts.length, last: contracts[0] ?? null };
}

/**
 * Qué saldrá en la próxima impresión del contrato (mismo criterio que el botón
 * de la web): «original» la primera vez, «COPIA N.º X» después.
 */
export function labelNextContractPrint(summary: ContractPrintSummary): string {
  return summary.count > 0
    ? `La próxima impresión sale como COPIA N.º ${summary.count + 1}`
    : 'La próxima impresión sale como original';
}

/** «Contrato impreso 2 veces · última 30/09/2026 10:15 a. m. por Ana» o «Contrato sin imprimir». */
export function labelContractPrintSummary(summary: ContractPrintSummary): string {
  if (summary.count <= 0 || !summary.last) return 'Contrato sin imprimir';
  const times = summary.count === 1 ? '1 vez' : `${summary.count} veces`;
  const by = summary.last.printedByName ? ` por ${summary.last.printedByName}` : '';
  return `Contrato impreso ${times} · última ${formatPaymentDateTime(summary.last.printedAt)}${by}`;
}
