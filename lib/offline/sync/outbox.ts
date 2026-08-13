import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import { createIdempotencyKey } from '@/lib/idempotency';
import { SyncMeta, SyncOutboxItem } from '../models';
import { nextRetryAt } from './retryPolicy';
import type { OutboxCommandType } from './types';

export async function enqueueOutbox(
  database: Database,
  type: OutboxCommandType,
  payload: unknown,
  idempotencyKey = createIdempotencyKey()
) {
  return database.write(async () =>
    database.get<SyncOutboxItem>('sync_outbox').create((record) => {
      record.type = type;
      record.payloadJson = JSON.stringify(payload);
      record.idempotencyKey = idempotencyKey;
      record.status = 'pending';
      record.attempts = 0;
      record.lastError = null;
      record.nextRetryAt = Date.now();
      record.queuedAt = Date.now();
      record.resultJson = null;
    })
  );
}

export async function listDueOutbox(database: Database, now = Date.now()) {
  const items = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('status', Q.oneOf(['pending', 'error'])))
    .fetch();
  return items
    .filter((item) => item.nextRetryAt <= now)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function countPendingOutbox(database: Database) {
  const items = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('status', Q.oneOf(['pending', 'error', 'syncing', 'conflict'])))
    .fetchCount();
  return items;
}

export async function markOutboxSyncing(item: SyncOutboxItem) {
  await item.update((record) => {
    record.status = 'syncing';
  });
}

export async function markOutboxDone(item: SyncOutboxItem, result?: unknown) {
  await item.update((record) => {
    record.status = 'done';
    record.lastError = null;
    record.resultJson = result ? JSON.stringify(result) : record.resultJson;
  });
}

export async function markOutboxRetry(item: SyncOutboxItem, errorMessage: string) {
  await item.update((record) => {
    record.status = 'error';
    record.attempts = record.attempts + 1;
    record.lastError = errorMessage;
    record.nextRetryAt = nextRetryAt(record.attempts);
  });
}

export async function markOutboxTerminal(
  item: SyncOutboxItem,
  status: 'error' | 'conflict',
  errorMessage: string
) {
  await item.update((record) => {
    record.status = status;
    record.attempts = record.attempts + 1;
    record.lastError = errorMessage;
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
