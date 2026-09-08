import { supabase } from '@/lib/supabase';
import { uploadAndAttachPagoSupport } from '@/lib/uploadPagoSupport';
import { getDatabase } from '../database';
import { FileUpload, SyncOutboxItem } from '../models';
import { resolveCustomerIdNumberConflict } from './conflictPolicy';
import { parseOutboxPayload } from './outbox';
import { classifyPushError } from './retryPolicy';
import { deleteLocalPagoSupportFile } from '../security/localFiles';
import type {
  AttachPagoSupportPayload,
  CreateCustomerPayload,
  RegisterPagoPayload,
  RouteIdPayload,
  SelectStopPayload,
  UpdateRouteStopPayload,
} from './types';

export type PushResult =
  | {
      outcome: 'done';
      result?: unknown;
      note?: string;
      /** Cliente ya existente en el servidor que reemplaza al provisional local. */
      adoptExisting?: { id: string; name: string };
    }
  | { outcome: 'network'; message: string }
  | { outcome: 'retry'; message: string }
  | { outcome: 'fail'; message: string }
  | { outcome: 'conflict'; message: string };

function asErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error de sincronización');
  }
  return String(error || 'Error de sincronización');
}

export async function pushOutboxItem(item: SyncOutboxItem): Promise<PushResult> {
  try {
    const payload = parseOutboxPayload(item);
    switch (item.type) {
      case 'create_customer':
        return await pushCreateCustomer(payload as CreateCustomerPayload, item.idempotencyKey);
      case 'register_pago':
      case 'register_route_pago':
        return await pushRegisterPago(payload as RegisterPagoPayload, item.idempotencyKey);
      case 'update_route_stop':
        return await pushUpdateRouteStop(payload as UpdateRouteStopPayload);
      case 'start_route':
        return await pushStartRoute(payload as RouteIdPayload);
      case 'finish_route':
        return await pushFinishRoute(payload as RouteIdPayload);
      case 'select_route_stop':
        return await pushSelectStop(payload as SelectStopPayload);
      case 'attach_pago_support':
        return await pushAttachSupport(payload as AttachPagoSupportPayload);
      default:
        return { outcome: 'fail', message: `Comando desconocido: ${item.type}` };
    }
  } catch (error) {
    const message = asErrorMessage(error);
    const decision = classifyPushError(message);
    if (decision === 'network') return { outcome: 'network', message };
    if (decision === 'retry') return { outcome: 'retry', message };
    if (decision === 'conflict') return { outcome: 'conflict', message };
    return { outcome: 'fail', message };
  }
}

async function pushCreateCustomer(payload: CreateCustomerPayload, idempotencyKey: string): Promise<PushResult> {
  const { data, error } = await supabase.rpc('create_customer_offline', {
    p_customer_id: payload.customerId,
    p_name: payload.name,
    p_id_number: payload.idNumber,
    p_phone: payload.phone,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  const result = data as { customer_id?: string; conflict?: boolean; existing?: { id: string; name: string } };
  const conflict = resolveCustomerIdNumberConflict({
    localId: payload.customerId,
    idNumber: payload.idNumber,
    existing: result?.conflict && result.existing ? result.existing : null,
  });
  if (conflict.status === 'conflict' && conflict.conflict) {
    return {
      outcome: 'done',
      result,
      adoptExisting: { id: conflict.conflict.existingId, name: conflict.conflict.existingName },
      note: `Ya existía un cliente con documento ${payload.idNumber}; se usó el registro existente (${conflict.conflict.existingName}).`,
    };
  }
  return { outcome: 'done', result };
}

async function pushRegisterPago(payload: RegisterPagoPayload, idempotencyKey: string): Promise<PushResult> {
  const { data, error } = payload.routeStopId
    ? await supabase.rpc('register_collection_route_payment', {
        p_stop_id: payload.routeStopId,
        p_amount: payload.amount,
        p_paid_at: payload.paidAt,
        p_receipt_number: payload.receiptNumber,
        p_cuota_id: null,
        p_notes: payload.notes,
        p_idempotency_key: idempotencyKey,
      })
    : await supabase.rpc('register_negocio_pago', {
        p_negocio_id: payload.negocioId,
        p_amount: payload.amount,
        p_paid_at: payload.paidAt,
        p_receipt_number: payload.receiptNumber,
        p_cuota_id: null,
        p_notes: payload.notes,
        p_idempotency_key: idempotencyKey,
      });
  if (error) throw error;
  const pagoId = String(data || '');
  if (!pagoId) return { outcome: 'retry', message: 'El servidor no devolvió el id del pago' };
  return { outcome: 'done', result: { pagoId } };
}

async function pushUpdateRouteStop(payload: UpdateRouteStopPayload): Promise<PushResult> {
  const { error } = await supabase.rpc('update_collection_route_stop', {
    p_stop_id: payload.stopId,
    p_status: payload.status,
    p_reason: payload.reason,
    p_notes: payload.notes || null,
  });
  if (error) throw error;
  return { outcome: 'done' };
}

async function pushStartRoute(payload: RouteIdPayload): Promise<PushResult> {
  const { error } = await supabase.rpc('start_collection_route', { p_route_id: payload.routeId });
  if (error) throw error;
  return { outcome: 'done' };
}

async function pushFinishRoute(payload: RouteIdPayload): Promise<PushResult> {
  const { error } = await supabase.rpc('finish_collection_route', {
    p_route_id: payload.routeId,
    p_cancel: Boolean(payload.cancel),
  });
  if (error) throw error;
  return { outcome: 'done' };
}

async function pushSelectStop(payload: SelectStopPayload): Promise<PushResult> {
  const { error } = await supabase.rpc('select_collection_route_stop', { p_stop_id: payload.stopId });
  if (error) throw error;
  return { outcome: 'done' };
}

async function pushAttachSupport(payload: AttachPagoSupportPayload): Promise<PushResult> {
  const database = getDatabase();
  let upload: FileUpload;
  try {
    upload = await database.get<FileUpload>('file_uploads').find(payload.fileUploadId);
  } catch {
    return { outcome: 'fail', message: 'No se encontró el archivo de soporte local' };
  }
  if (upload.status === 'done') {
    return { outcome: 'done' };
  }
  if (upload.status === 'failed') {
    return { outcome: 'fail', message: upload.lastError || 'El soporte fue descartado' };
  }
  if (!upload.pagoServerId) {
    // Comparte carril con su pago: solo llega aquí si el pago aún no confirmó.
    return { outcome: 'retry', message: 'El pago aún no tiene id de servidor' };
  }
  await uploadAndAttachPagoSupport({
    negocioId: payload.negocioId,
    pagoId: upload.pagoServerId,
    file: {
      uri: upload.localUri,
      mimeType: upload.mime,
      name: upload.fileName,
    },
  });
  await database.write(async () => {
    await upload.update((record) => {
      record.status = 'done';
    });
  });
  await deleteLocalPagoSupportFile(upload.localUri);
  return { outcome: 'done' };
}
