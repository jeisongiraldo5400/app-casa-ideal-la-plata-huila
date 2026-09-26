import type { Database } from '@nozbe/watermelondb';
import type { SyncOutboxItem } from '../models';
import {
  listNegociosDependingOnCustomer,
  prepareDiscardNegocioSignature,
  prepareRejectedNegocio,
  prepareRetryNegocio,
  prepareRetryNegocioSignature,
} from './negocioCreateCommand';
import { dismissOutboxNotice, parseOutboxPayload } from './outbox';
import { collectRevertCommand, PreparedChanges } from './reconcile';
import type { CreateCustomerPayload, CreateNegocioPayload } from './types';

/**
 * Acciones de la persona sobre la cola «Cambios sin sincronizar»: reintentar,
 * descartar y dar por visto un aviso. Viven aquí (y no en la pantalla) porque
 * cada una arrastra reglas: las firmas del negocio, los negocios que dependen
 * de un cliente creado sin señal.
 */

export const DISCARDED_BY_USER_REASON = 'Descartado por el usuario';

async function findItem(database: Database, id: string): Promise<SyncOutboxItem | null> {
  try {
    return await database.get<SyncOutboxItem>('sync_outbox').find(id);
  } catch {
    return null;
  }
}

export type RetryOutcome = { retried: true } | { retried: false; reason: string };

/**
 * Vuelve a encolar un comando terminal. Un negocio arrastra sus firmas; si
 * alguna ya no está en el teléfono no se reintenta y el comando queda con el
 * motivo («Hay que volver a firmar…»).
 */
export async function retryOutboxEntry(database: Database, id: string, now = Date.now()): Promise<RetryOutcome> {
  const item = await findItem(database, id);
  if (!item) return { retried: false, reason: 'El cambio ya no está en la cola' };
  let blocked: string | null = null;
  await database.write(async () => {
    const changes = new PreparedChanges();
    if (item.type === 'create_negocio') {
      blocked = await prepareRetryNegocio(database, item, changes, now);
    } else if (item.type === 'upload_negocio_signature') {
      blocked = await prepareRetryNegocioSignature(database, item, changes, now);
    } else {
      changes.update(item, (row) => {
        row.status = 'pending';
        row.attempts = 0;
        row.lastError = null;
        row.nextRetryAt = now;
      });
    }
    if (blocked) {
      const reason = blocked;
      const rejected = new PreparedChanges();
      rejected.update(item, (row) => {
        row.status = 'failed';
        row.lastError = reason;
      });
      await database.batch(...rejected.build());
      return;
    }
    const operations = changes.build();
    if (operations.length) await database.batch(...operations);
  });
  return blocked ? { retried: false, reason: blocked } : { retried: true };
}

/** Negocio de la cola que depende de un cliente creado sin señal. */
export type CustomerDependent = { outboxId: string; negocioId: string; customerName: string; totalCredit: number };

/**
 * Negocios que se quedarían sin cliente si se descarta este `create_customer`.
 * Vacío para cualquier otro tipo de comando.
 */
export async function listCustomerDependents(database: Database, id: string): Promise<CustomerDependent[]> {
  const item = await findItem(database, id);
  if (!item || item.type !== 'create_customer') return [];
  const customer = parseOutboxPayload<CreateCustomerPayload>(item);
  const dependents = await listNegociosDependingOnCustomer(database, customer.customerId);
  return dependents.map((dependent) => {
    const payload = parseOutboxPayload<CreateNegocioPayload>(dependent);
    return {
      outboxId: dependent.id,
      negocioId: payload.negocioId,
      customerName: payload.customerName,
      totalCredit: Number(payload.totalCredit || 0),
    };
  });
}

/**
 * Descarta un comando y revierte su efecto local. Descartar un cliente creado
 * sin señal descarta también los negocios que lo usan (la pantalla lo avisa
 * antes): enviarlos solo los haría fallar por «El cliente del negocio no
 * existe». Los archivos de firma se borran solo aquí, al descartar.
 */
export async function discardOutboxEntry(database: Database, id: string): Promise<{ discarded: number }> {
  const item = await findItem(database, id);
  if (!item) return { discarded: 0 };
  let discarded = 0;
  await database.write(async () => {
    const changes = new PreparedChanges();
    const discardOne = async (target: SyncOutboxItem, reason: string) => {
      // Un negocio descartado no desaparece del teléfono: queda marcado con el
      // motivo, igual que si lo hubiera rechazado el servidor. El cliente ya
      // firmó el contrato y alguien tiene que decidir qué hacer con él.
      if (target.type === 'create_negocio') {
        await prepareRejectedNegocio(
          database,
          parseOutboxPayload<CreateNegocioPayload>(target),
          reason,
          changes,
          { discard: true }
        );
      }
      if (target.type === 'upload_negocio_signature') {
        await prepareDiscardNegocioSignature(database, target, reason, changes);
      }
      await collectRevertCommand(database, target, reason, changes);
      changes.update(target, (row) => {
        row.status = 'discarded';
        row.lastError = reason;
      });
      discarded += 1;
    };

    if (item.type === 'create_customer') {
      const customer = parseOutboxPayload<CreateCustomerPayload>(item);
      const dependents = await listNegociosDependingOnCustomer(database, customer.customerId);
      const reason = `Descartado junto con el cliente ${customer.name || ''}`.trim();
      for (const dependent of dependents) await discardOne(dependent, reason);
    }
    await discardOne(item, DISCARDED_BY_USER_REASON);
    const operations = changes.build();
    if (operations.length) await database.batch(...operations);
  });
  return { discarded };
}

/** La persona leyó el aviso de un comando ya enviado. */
export async function dismissOutboxNoticeEntry(database: Database, id: string) {
  const item = await findItem(database, id);
  if (!item) return;
  await database.write(async () => dismissOutboxNotice(item));
}
