import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import { createIdempotencyKey } from '@/lib/idempotency';
import { SyncMeta, SyncOutboxItem } from '../models';
import { NETWORK_RETRY_DELAY_MS, nextRetryAt, type OutboxStatus } from './retryPolicy';
import { laneForCommand, type OutboxCommandType } from './types';

const ACTIVE_STATUSES: OutboxStatus[] = ['pending', 'syncing', 'error'];
const FAILED_STATUSES: OutboxStatus[] = ['failed', 'conflict'];

function withLane(type: OutboxCommandType, payload: unknown) {
  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  return { ...record, lane: laneForCommand(type, record) };
}

export async function enqueueOutbox(
  database: Database,
  type: OutboxCommandType,
  payload: unknown,
  idempotencyKey = createIdempotencyKey()
) {
  return database.write(async () =>
    createOutboxRecord(database, type, payload, idempotencyKey)
  );
}

/** Creates a command inside an existing WatermelonDB writer. */
export async function createOutboxRecord(
  database: Database,
  type: OutboxCommandType,
  payload: unknown,
  idempotencyKey = createIdempotencyKey()
) {
  return database.get<SyncOutboxItem>('sync_outbox').create(fillOutboxRecord(type, payload, idempotencyKey));
}

/** Prepared create, to be batched atomically with the optimistic local rows. */
export function prepareOutboxRecord(
  database: Database,
  type: OutboxCommandType,
  payload: unknown,
  idempotencyKey = createIdempotencyKey()
) {
  return database
    .get<SyncOutboxItem>('sync_outbox')
    .prepareCreate(fillOutboxRecord(type, payload, idempotencyKey));
}

function fillOutboxRecord(type: OutboxCommandType, payload: unknown, idempotencyKey: string) {
  const now = Date.now();
  const laned = withLane(type, payload);
  return (record: SyncOutboxItem) => {
    record.type = type;
    record.payloadJson = JSON.stringify(laned);
    record.idempotencyKey = idempotencyKey;
    record.status = 'pending';
    record.attempts = 0;
    record.lastError = null;
    record.nextRetryAt = now;
    record.queuedAt = now;
    record.resultJson = null;
  };
}

export function parseOutboxPayload<T = Record<string, unknown>>(item: SyncOutboxItem): T {
  try {
    return JSON.parse(item.payloadJson) as T;
  } catch {
    return {} as T;
  }
}

export function outboxLane(item: SyncOutboxItem): string {
  return laneForCommand(item.type as OutboxCommandType, parseOutboxPayload(item));
}

/** Comandos que aún pueden enviarse (pendientes o en backoff). */
export async function listActiveOutbox(database: Database) {
  return database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('status', Q.oneOf(['pending', 'error'])))
    .fetch();
}

export async function listDueOutbox(database: Database, now = Date.now()) {
  const items = await listActiveOutbox(database);
  return items
    .filter((item) => item.nextRetryAt <= now)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * Enviados con un aviso para la persona (`last_error` en un comando `done`):
 * p. ej. «el negocio quedó a nombre del dueño del cliente» o «se usó el cliente
 * que ya existía». Se muestran en la cola hasta que la persona los da por
 * vistos; pasado este tiempo dejan de mostrarse solos.
 */
export const OUTBOX_NOTICE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function listNoticeOutbox(database: Database, now = Date.now()) {
  const done = await database.get<SyncOutboxItem>('sync_outbox').query(Q.where('status', 'done')).fetch();
  return done.filter((item) => Boolean(item.lastError) && now - item.queuedAt <= OUTBOX_NOTICE_TTL_MS);
}

/** Comandos visibles para el usuario: activos, terminales y avisos recientes. */
export async function listReviewableOutbox(database: Database, now = Date.now()) {
  const items = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('status', Q.oneOf([...ACTIVE_STATUSES, ...FAILED_STATUSES])))
    .fetch();
  const notices = await listNoticeOutbox(database, now);
  return [...items, ...notices].sort((a, b) => a.queuedAt - b.queuedAt);
}

/** La persona ya leyó el aviso de un comando enviado: deja de mostrarse. */
export async function dismissOutboxNotice(item: SyncOutboxItem) {
  if (item.status !== 'done') return;
  await item.update((record) => {
    record.lastError = null;
  });
}

/**
 * A process can be terminated after persisting `syncing` and before storing the
 * server result. Replays are safe (idempotency keys or state-based checks on
 * the server), so interrupted commands return to the pending queue.
 */
export async function recoverInterruptedOutbox(database: Database, now = Date.now()) {
  const interrupted = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('status', 'syncing'))
    .fetch();

  if (!interrupted.length) return 0;

  await database.write(async () => {
    for (const item of interrupted) {
      await item.update((record) => {
        record.status = 'pending';
        record.lastError = 'Sincronización interrumpida; se reintentará automáticamente';
        record.nextRetryAt = now;
      });
    }
  });

  return interrupted.length;
}

export type OutboxCounts = { pending: number; failed: number; notices: number };

export async function countOutbox(database: Database, now = Date.now()): Promise<OutboxCounts> {
  const collection = database.get<SyncOutboxItem>('sync_outbox');
  const [pending, failed, notices] = await Promise.all([
    collection.query(Q.where('status', Q.oneOf(ACTIVE_STATUSES))).fetchCount(),
    collection.query(Q.where('status', Q.oneOf(FAILED_STATUSES))).fetchCount(),
    listNoticeOutbox(database, now).then((items) => items.length),
  ]);
  return { pending, failed, notices };
}

export async function markOutboxSyncing(item: SyncOutboxItem) {
  await item.update((record) => {
    record.status = 'syncing';
  });
}

export async function markOutboxDone(item: SyncOutboxItem, result?: unknown, note?: string | null) {
  await item.update((record) => {
    record.status = 'done';
    record.lastError = note ?? null;
    record.resultJson = result ? JSON.stringify(result) : record.resultJson;
  });
}

/** Error transitorio del servidor: consume un intento y aplica backoff. */
export async function markOutboxRetry(item: SyncOutboxItem, errorMessage: string, now = Date.now()) {
  await item.update((record) => {
    record.status = 'error';
    record.attempts = record.attempts + 1;
    record.lastError = errorMessage;
    record.nextRetryAt = nextRetryAt(record.attempts, now);
  });
}

/** La petición no llegó al servidor: no consume intentos. */
export async function markOutboxNetworkRetry(item: SyncOutboxItem, errorMessage: string, now = Date.now()) {
  await item.update((record) => {
    record.status = 'pending';
    record.lastError = errorMessage;
    record.nextRetryAt = now + NETWORK_RETRY_DELAY_MS;
  });
}

export async function markOutboxTerminal(
  item: SyncOutboxItem,
  status: 'failed' | 'conflict',
  errorMessage: string
) {
  await item.update((record) => {
    record.status = status;
    record.attempts = record.attempts + 1;
    record.lastError = errorMessage;
  });
}

/** Vuelve a encolar un comando terminal por decisión del usuario. */
export async function resetOutboxItem(item: SyncOutboxItem, now = Date.now()) {
  await item.update((record) => {
    record.status = 'pending';
    record.attempts = 0;
    record.lastError = null;
    record.nextRetryAt = now;
  });
}

export async function markOutboxDiscarded(item: SyncOutboxItem, note?: string | null) {
  await item.update((record) => {
    record.status = 'discarded';
    record.lastError = note ?? record.lastError;
  });
}

export async function getMeta(database: Database, key: string) {
  const rows = await database.get<SyncMeta>('sync_meta').query(Q.where('key', key)).fetch();
  return rows[0]?.value ?? null;
}

export async function setMeta(database: Database, key: string, value: string) {
  const collection = database.get<SyncMeta>('sync_meta');
  const rows = await collection.query(Q.where('key', key)).fetch();
  await database.write(async () => {
    if (rows[0]) {
      await rows[0].update((record) => {
        record.value = value;
      });
    } else {
      await collection.create((record) => {
        record.key = key;
        record.value = value;
      });
    }
  });
}
