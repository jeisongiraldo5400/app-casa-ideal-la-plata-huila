import AsyncStorage from '@react-native-async-storage/async-storage';
import { createIdempotencyKey } from '@/lib/idempotency';
import { supabase } from '@/lib/supabase';
import type { PrintCopyInfo } from '@/lib/printCopy';
import {
  mergeHistoryIntoCache,
  nextOfflineCopyNumber,
  parsePrintHistory,
  parseRegisterPrintResponse,
  printCopyKey,
  rememberCopyNumber,
  type NegocioPrintDocument,
  type NegocioPrintEvent,
  type NegocioPrintFormat,
  type PrintCopyCache,
} from '@/lib/negocios/printRegistry';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { findPendingPagoCommand, queuePrintOffline } from '@/lib/offline/repositories/offlineRepository';

/**
 * Registro de impresiones del contrato y los recibos (`register_negocio_print`,
 * 20261231300000). Con red el servidor asigna el número de copia; sin red el
 * teléfono imprime con el mayor número que conoce + 1 y encola el registro.
 */

const CACHE_KEY = '@casa_ideal/impresiones/copias_v1';

async function readCache(): Promise<PrintCopyCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as PrintCopyCache) : {};
  } catch {
    return {};
  }
}

async function writeCache(cache: PrintCopyCache) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Solo sirve para numerar copias sin señal.
  }
}

async function rememberInCache(key: string, copyNumber: number) {
  await writeCache(rememberCopyNumber(await readCache(), key, copyNumber));
}

export type RecordNegocioPrintInput = {
  negocioId: string;
  document: NegocioPrintDocument;
  format: NegocioPrintFormat;
  /** Id del pago en el servidor (recibo de un pago ya sincronizado). */
  pagoId?: string | null;
  /** Pago hecho sin señal, aún en la cola: id local de su fila. */
  pendingPagoLocalId?: string | null;
  /** Pago recién hecho sin señal: su llave y su carril (de `registerPagoOffline`). */
  pendingPago?: { idempotencyKey: string; lane: string } | null;
  /** Nombre de quien imprime, para la marca de una copia hecha sin señal. */
  printedByName?: string | null;
};

/**
 * Registra una impresión y devuelve el número de copia para el papel. Nunca
 * lanza: si no se puede registrar ni encolar, devuelve null y se imprime sin
 * marca (no se bloquea la impresión).
 */
export async function recordNegocioPrint(input: RecordNegocioPrintInput): Promise<PrintCopyInfo | null> {
  try {
    const pendingPago =
      input.pendingPago ??
      (input.pendingPagoLocalId ? await findPendingPagoCommand(input.pendingPagoLocalId) : null);
    const pagoId = input.document === 'recibo' && !pendingPago ? input.pagoId ?? null : null;
    const pagoIdempotencyKey = input.document === 'recibo' ? pendingPago?.idempotencyKey ?? null : null;
    const key = printCopyKey({ negocioId: input.negocioId, document: input.document, pagoId, pagoIdempotencyKey });
    const clientEventId = createIdempotencyKey();
    const printedAt = new Date().toISOString();

    // Un pago en cola todavía no existe en el servidor: su recibo se registra
    // en la cola, detrás del pago.
    if (!pendingPago && useSyncStore.getState().online) {
      try {
        const { data, error } = await supabase.rpc('register_negocio_print' as never, {
          p_negocio_id: input.negocioId,
          p_document: input.document,
          p_format: input.format,
          p_channel: 'movil',
          p_pago_id: pagoId,
          p_client_event_id: clientEventId,
        } as never);
        if (error) throw error;
        const copy = parseRegisterPrintResponse(data, printedAt);
        if (copy) {
          await rememberInCache(key, copy.number);
          return copy;
        }
      } catch (error) {
        if (!isNetworkError(error)) {
          console.warn('[impresiones] no se pudo registrar la impresión', error);
          return null;
        }
      }
    }

    const copyNumber = nextOfflineCopyNumber(await readCache(), key);
    const queued = await queuePrintOffline({
      negocioId: input.negocioId,
      document: input.document,
      format: input.format,
      pagoId,
      pagoIdempotencyKey,
      clientEventId,
      printedAt,
      copyNumber,
      ...(pendingPago ? { lane: pendingPago.lane } : {}),
    });
    if (!queued) return null;
    await rememberInCache(key, copyNumber);
    return { number: copyNumber, printedAt, printedBy: input.printedByName ?? null };
  } catch (error) {
    console.warn('[impresiones] no se pudo registrar la impresión', error);
    return null;
  }
}

/**
 * Historial de impresiones del negocio (con red). También siembra la caché
 * para numerar bien las copias que se impriman después sin señal.
 */
export async function fetchNegocioPrintHistory(negocioId: string): Promise<NegocioPrintEvent[]> {
  const { data, error } = await supabase.rpc('get_negocio_print_history' as never, {
    p_negocio_id: negocioId,
  } as never);
  if (error) throw error;
  const events = parsePrintHistory(data);
  await writeCache(mergeHistoryIntoCache(await readCache(), negocioId, events));
  return events;
}
