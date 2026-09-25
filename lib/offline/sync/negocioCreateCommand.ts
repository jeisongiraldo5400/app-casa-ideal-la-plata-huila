import { Q } from '@nozbe/watermelondb';
import type { Database, Model } from '@nozbe/watermelondb';
import { supabase } from '@/lib/supabase';
import { createIdempotencyKey } from '@/lib/idempotency';
import {
  NEGOCIO_SIGNATURE_BUCKET,
  extractNegocioSignaturePath,
  isNewLocalSignature,
  negocioSignaturePath,
  uploadNegocioSignature,
} from '@/lib/uploadSignature';
import { getDatabase } from '../database';
import { FileUpload, Negocio, SyncOutboxItem } from '../models';
import { persistNegocioSignatureFile, deleteLocalPagoSupportFile } from '../security/localFiles';
import { requireLocalUserId } from '../security/localSession';
import { prepareOutboxRecord, parseOutboxPayload } from './outbox';
import { isDefinitiveOriginError } from './retryPolicy';
import type { PreparedChanges } from './reconcile';
import {
  REJECTED_ROW_SYNC_STATUS,
  type CreateNegocioPayload,
  type NegocioSignatureRole,
  type UploadNegocioSignaturePayload,
} from './types';

/** Texto que acompaña al negocio rechazado cuando el servidor no dio motivo. */
export const DEFAULT_REJECTED_NEGOCIO_REASON = 'El servidor no aceptó el negocio';

/** Estado que da la base al negocio con firma del cliente y sin activar. */
const NEGOCIO_DRAFT_STATUS = 'por_firmar';

type SignatureInput = {
  role: NegocioSignatureRole;
  /** `data:image/png;base64,…`, `file:`/`content:` o una ruta ya subida. */
  value: string | null | undefined;
};

export type EnqueueNegocioCreateInput = {
  negocioId: string;
  idempotencyKey: string;
  /**
   * Casi siempre false: sin señal no se activa. Sólo llega true cuando la red
   * se cayó DESPUÉS de haber podido enviar el RPC, porque entonces el reenvío
   * tiene que ser idéntico al que quizá ya recibió el servidor.
   */
  activate?: boolean;
  /** Argumentos del RPC tal cual, SIN las urls de firma (se añaden aquí). */
  negocio: Record<string, unknown>;
  items: Record<string, unknown>[];
  signatures: SignatureInput[];
  /** Datos para pintar el negocio pendiente en el teléfono. */
  local: {
    dealDate: string | null;
    totalCredit: number;
    customerId: string;
    customerName: string;
    codeudorCustomerId: string | null;
    direccion: string | null;
    municipioId: string | null;
    municipioName: string | null;
    sellerId: string | null;
    sellerName: string | null;
    /** Quién lo registra: el usuario del teléfono (el contrato lo pone en «CREADO POR»). */
    createdBy?: string | null;
  };
  /**
   * Carril del negocio. Si el cliente también está en la cola (se creó sin
   * señal), se pasa el carril del cliente para que el negocio salga DESPUÉS.
   */
  lane?: string;
};

/**
 * Deja listo en el teléfono un negocio creado sin señal:
 *
 *   1. guarda cada firma nueva en el almacenamiento privado de la app y encola
 *      su subida a Storage (`upload_negocio_signature`);
 *   2. encola el RPC `create_negocio` con los MISMOS argumentos que se habrían
 *      enviado con red, incluidas las rutas de esas firmas (decididas ya, para
 *      que el hash de idempotencia del servidor no cambie entre reintentos);
 *   3. crea la fila local del negocio en estado `pending`, para que la venta
 *      se vea en el teléfono mientras el servidor no la confirme.
 *
 * Todo comparte carril, así que la cola respeta el orden: firmas → negocio.
 */
export async function enqueueNegocioCreateOffline(input: EnqueueNegocioCreateInput) {
  const database = getDatabase();
  const userId = await requireLocalUserId();
  const lane = input.lane || `negocio:${input.negocioId}`;

  // Paso 1 fuera de la transacción: escribir ficheros es E/S lenta.
  const pending: {
    role: NegocioSignatureRole;
    localUri: string;
    storagePath: string;
  }[] = [];
  const signatureUrls: Partial<Record<NegocioSignatureRole, string | null>> = {};
  for (const signature of input.signatures) {
    const raw = signature.value?.trim();
    if (!raw) {
      signatureUrls[signature.role] = null;
      continue;
    }
    if (!isNewLocalSignature(raw)) {
      // Firma que ya vive en Storage (reintento tras un fallo con red).
      signatureUrls[signature.role] = extractNegocioSignaturePath(raw);
      continue;
    }
    const fileLocalId = createIdempotencyKey();
    const localUri = await persistNegocioSignatureFile(raw, fileLocalId, signature.role);
    const storagePath = negocioSignaturePath({
      userId,
      negocioId: input.negocioId,
      role: signature.role,
      suffix: fileLocalId,
    });
    signatureUrls[signature.role] = storagePath;
    pending.push({ role: signature.role, localUri, storagePath });
  }

  const negocio = {
    ...input.negocio,
    customer_signature_url: signatureUrls.cliente ?? null,
    guarantor_signature_url: signatureUrls.fiador ?? null,
    seller_signature_url: signatureUrls.vendedor ?? null,
  };
  const payload: CreateNegocioPayload = {
    lane,
    negocioId: input.negocioId,
    activate: Boolean(input.activate),
    negocio,
    items: input.items,
    customerId: input.local.customerId,
    customerName: input.local.customerName,
    totalCredit: input.local.totalCredit,
  };

  await database.write(async () => {
    const operations: Model[] = [];
    for (const item of pending) {
      const upload = database.get<FileUpload>('file_uploads').prepareCreate((record) => {
        record.localUri = item.localUri;
        record.mime = 'image/png';
        record.fileName = `firma-${item.role}.png`;
        record.bucket = NEGOCIO_SIGNATURE_BUCKET;
        record.negocioId = input.negocioId;
        record.pagoLocalId = null;
        record.pagoServerId = null;
        record.status = 'pending';
        record.lastError = null;
      });
      operations.push(upload);
      const signaturePayload: UploadNegocioSignaturePayload = {
        lane,
        fileUploadId: upload.id,
        negocioId: input.negocioId,
        role: item.role,
        storagePath: item.storagePath,
      };
      operations.push(prepareOutboxRecord(database, 'upload_negocio_signature', signaturePayload));
    }

    operations.push(
      database.get<Negocio>('negocios').prepareCreate((record) => {
        record._raw.id = input.negocioId;
        // El número lo asigna el servidor: hasta que confirme no hay número.
        record.numero = 0;
        record.status = NEGOCIO_DRAFT_STATUS;
        record.dealDate = input.local.dealDate;
        record.totalCredit = input.local.totalCredit;
        record.remainingBalance = input.local.totalCredit;
        record.customerId = input.local.customerId;
        record.codeudorCustomerId = input.local.codeudorCustomerId;
        record.direccion = input.local.direccion;
        record.municipioId = input.local.municipioId;
        record.municipioName = input.local.municipioName;
        record.sellerId = input.local.sellerId;
        record.gestorCobroId = null;
        record.sellerName = input.local.sellerName;
        record.gestorCobroName = null;
        record.createdBy = input.local.createdBy ?? null;
        // El nombre se resuelve al leer, con los perfiles descargados.
        record.createdByName = null;
        record.rejectedReason = null;
        record.rejectedAt = null;
        record.rowSyncStatus = 'pending';
        record.serverUpdatedAt = null;
      })
    );
    operations.push(
      prepareOutboxRecord(database, 'create_negocio', payload, input.idempotencyKey)
    );
    await database.batch(...operations);
  });

  return { negocioId: input.negocioId, queuedSignatures: pending.length };
}

/** Sube una firma guardada en el teléfono a su ruta ya decidida. */
export async function pushUploadNegocioSignature(payload: UploadNegocioSignaturePayload) {
  const database = getDatabase();
  let upload: FileUpload;
  try {
    upload = await database.get<FileUpload>('file_uploads').find(payload.fileUploadId);
  } catch {
    return { outcome: 'fail' as const, message: 'No se encontró la firma guardada en el teléfono' };
  }
  if (upload.status === 'done') return { outcome: 'done' as const };
  if (upload.status === 'failed') {
    return { outcome: 'fail' as const, message: upload.lastError || 'La firma fue descartada' };
  }

  await uploadNegocioSignature(upload.localUri, {
    negocioId: payload.negocioId,
    role: payload.role,
    path: payload.storagePath,
    // La ruta es fija: si un intento anterior llegó a subir el archivo, el
    // reintento debe poder pisarlo en vez de fallar por «ya existe».
    upsert: true,
  });
  await database.write(async () => {
    await upload.update((record) => {
      record.status = 'done';
    });
  });
  await deleteLocalPagoSupportFile(upload.localUri);
  return { outcome: 'done' as const };
}

/** Firmas de este negocio que todavía no están en Storage. */
async function pendingSignatureCount(database: Database, negocioId: string) {
  const uploads = await database
    .get<FileUpload>('file_uploads')
    .query(Q.where('negocio_id', negocioId), Q.where('bucket', NEGOCIO_SIGNATURE_BUCKET))
    .fetch();
  return uploads.filter((upload) => upload.status !== 'done').length;
}

/**
 * Reenvía el RPC tal cual se encoló. El servidor recibe el mismo
 * `p_negocio_id` y la misma `p_idempotency_key`, así que repetirlo no duplica.
 */
/**
 * Comandos de cliente todavía sin confirmar. Si el negocio referencia a uno de
 * ellos, ese cliente aún no existe en el servidor: hay que esperar.
 */
export async function pendingCustomerLane(
  database: Database,
  customerIds: (string | null | undefined)[]
): Promise<string | null> {
  const wanted = customerIds.filter((id): id is string => Boolean(id));
  if (!wanted.length) return null;
  const queued = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('type', 'create_customer'), Q.where('status', Q.oneOf(['pending', 'syncing', 'error'])))
    .fetch();
  for (const id of wanted) {
    const match = queued.find(
      (item) => parseOutboxPayload<{ customerId?: string }>(item).customerId === id
    );
    if (match) return `customer:${id}`;
  }
  return null;
}

/**
 * Carril del negocio: el del cliente si ese cliente también está en la cola
 * (así el cliente sube primero), y si no, el suyo propio.
 */
export async function negocioLaneFor(
  negocioId: string,
  customerIds: (string | null | undefined)[]
): Promise<string> {
  const customerLane = await pendingCustomerLane(getDatabase(), customerIds);
  return customerLane || `negocio:${negocioId}`;
}

export async function pushCreateNegocio(payload: CreateNegocioPayload, idempotencyKey: string) {
  const database = getDatabase();
  const negocio = (payload.negocio || {}) as Record<string, unknown>;
  // El cliente pudo crearse también sin señal. Comparten carril (el negocio se
  // encoló con el carril del cliente), pero si el codeudor viniera por otro
  // carril esta comprobación evita mandar un negocio sin cliente.
  if (
    await pendingCustomerLane(database, [
      typeof negocio.customer_id === 'string' ? negocio.customer_id : null,
      typeof negocio.codeudor_customer_id === 'string' ? negocio.codeudor_customer_id : null,
    ])
  ) {
    return {
      outcome: 'retry' as const,
      message: 'El cliente del negocio todavía no se ha subido al servidor',
    };
  }
  if (await pendingSignatureCount(database, payload.negocioId)) {
    // Comparte carril con sus firmas, así que en la práctica no se llega aquí;
    // la comprobación evita crear un negocio cuya firma no está en Storage.
    return { outcome: 'retry' as const, message: 'Las firmas del negocio aún no se han subido' };
  }

  const { data, error } = await supabase.rpc('create_negocio', {
    p_negocio_id: payload.negocioId,
    p_idempotency_key: idempotencyKey,
    p_activate: payload.activate,
    p_negocio: payload.negocio as never,
    p_items: payload.items as never,
  });
  if (error) {
    // Falta de existencias, o el origen (orden de entrega / remisión) cambió
    // mientras no había señal: cancelada, ya vinculada, inexistente, remisión
    // que ya salió o sin disponible. Insistir no lo arregla, así que se marca
    // rechazado en el acto, con el motivo del servidor, en vez de reintentar
    // medio día.
    const message = String((error as { message?: unknown })?.message || error);
    if (/stock|existencias/i.test(message) || isDefinitiveOriginError(message)) {
      return { outcome: 'fail' as const, message };
    }
    throw error;
  }
  const negocioId = String(data || payload.negocioId);
  // Desde la descarga selectiva v2 nada baja solo: sin esto el negocio se
  // quedaría sin número en el teléfono hasta la próxima «Descargar». Es un
  // extra: si falla, el negocio igual queda confirmado.
  const confirmed = await fetchConfirmedNegocio(negocioId);
  return { outcome: 'done' as const, result: { negocioId, ...confirmed } };
}

/** Número y estado que el servidor le asignó al negocio recién creado. */
async function fetchConfirmedNegocio(
  negocioId: string
): Promise<{ numero?: number; status?: string }> {
  try {
    const { data, error } = await supabase
      .from('negocios')
      .select('numero, status')
      .eq('id', negocioId)
      .maybeSingle();
    if (error || !data) return {};
    const row = data as { numero?: unknown; status?: unknown };
    const numero = Number(row.numero);
    return {
      ...(Number.isFinite(numero) && numero > 0 ? { numero } : {}),
      ...(typeof row.status === 'string' && row.status ? { status: row.status } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Confirmado por el servidor: la fila local deja de ser optimista para que la
 * siguiente descarga la reemplace con la del servidor (número incluido).
 */
export async function prepareConfirmNegocio(
  database: Database,
  payload: CreateNegocioPayload,
  changes: PreparedChanges,
  confirmed: { numero?: number; status?: string } = {}
) {
  const negocio = await findNegocio(database, payload.negocioId);
  if (!negocio || negocio.rowSyncStatus === 'synced') return;
  changes.update(negocio, (row) => {
    if (confirmed.numero) row.numero = confirmed.numero;
    if (confirmed.status) row.status = confirmed.status;
    row.rowSyncStatus = 'synced';
    row.rejectedReason = null;
    row.rejectedAt = null;
  });
}

/**
 * Rechazado por el servidor (por ejemplo, sin existencias). El negocio NO se
 * borra: queda marcado con el motivo para que el vendedor sepa qué pasó con la
 * venta que ya firmó el cliente. Las firmas pendientes se descartan con él.
 */
export async function prepareRejectedNegocio(
  database: Database,
  payload: CreateNegocioPayload,
  reason: string | null,
  changes: PreparedChanges
) {
  const negocio = await findNegocio(database, payload.negocioId);
  if (negocio && negocio.rowSyncStatus !== 'synced') {
    changes.update(negocio, (row) => {
      row.rowSyncStatus = REJECTED_ROW_SYNC_STATUS;
      row.rejectedReason = reason || DEFAULT_REJECTED_NEGOCIO_REASON;
      row.rejectedAt = Date.now();
    });
  }

  const uploads = await database
    .get<FileUpload>('file_uploads')
    .query(Q.where('negocio_id', payload.negocioId), Q.where('bucket', NEGOCIO_SIGNATURE_BUCKET))
    .fetch();
  const uploadIds = new Set<string>();
  for (const upload of uploads) {
    if (upload.status === 'done') continue;
    uploadIds.add(upload.id);
    changes.update(upload, (row) => {
      row.status = 'failed';
      row.lastError = reason || DEFAULT_REJECTED_NEGOCIO_REASON;
    });
    void deleteLocalPagoSupportFile(upload.localUri);
  }
  if (!uploadIds.size) return;

  const queued = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('type', 'upload_negocio_signature'), Q.where('status', Q.oneOf(['pending', 'error'])))
    .fetch();
  for (const item of queued) {
    const signature = parseOutboxPayload<UploadNegocioSignaturePayload>(item);
    if (!uploadIds.has(String(signature.fileUploadId || ''))) continue;
    changes.update(item, (row) => {
      row.status = 'failed';
      row.lastError = reason || DEFAULT_REJECTED_NEGOCIO_REASON;
    });
  }
}

/**
 * El cliente provisional se cambió por uno que ya existía en el servidor
 * (mismo documento). Los negocios que siguen en cola apuntan al id viejo, que
 * acaba de desaparecer del teléfono: hay que reescribirlos antes de enviarlos.
 */
export async function prepareRelinkNegocioCustomer(
  database: Database,
  previousCustomerId: string,
  nextCustomerId: string,
  changes: PreparedChanges
) {
  if (!previousCustomerId || !nextCustomerId || previousCustomerId === nextCustomerId) return;
  const queued = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('type', 'create_negocio'), Q.where('status', Q.oneOf(['pending', 'error'])))
    .fetch();
  for (const item of queued) {
    const payload = parseOutboxPayload<CreateNegocioPayload>(item);
    const negocio = (payload.negocio || {}) as Record<string, unknown>;
    const usesCustomer = negocio.customer_id === previousCustomerId;
    const usesCodeudor = negocio.codeudor_customer_id === previousCustomerId;
    if (!usesCustomer && !usesCodeudor) continue;
    const next: CreateNegocioPayload = {
      ...payload,
      customerId: usesCustomer ? nextCustomerId : payload.customerId,
      negocio: {
        ...negocio,
        ...(usesCustomer ? { customer_id: nextCustomerId } : {}),
        ...(usesCodeudor ? { codeudor_customer_id: nextCustomerId } : {}),
      },
    };
    changes.update(item, (row) => {
      row.payloadJson = JSON.stringify(next);
    });
    const negocioRow = await findNegocio(database, payload.negocioId);
    if (negocioRow && usesCustomer) {
      changes.update(negocioRow, (row) => {
        row.customerId = nextCustomerId;
      });
    }
  }
}

async function findNegocio(database: Database, id: string) {
  try {
    return await database.get<Negocio>('negocios').find(id);
  } catch {
    return null;
  }
}
