import {
  DEFAULT_REJECTED_PAGO_REASON,
  PreparedChanges,
  prepareReconcileRegisteredPago,
  prepareRevertCommand,
} from '../reconcile';
import type { RegisterPagoPayload } from '../types';

/**
 * Al confirmarse un pago encolado, la fila local se reemplaza por otra con el id
 * del servidor. Si esa copia pierde campos, la app los muestra vacíos hasta el
 * siguiente pull, que puede tardar horas sin buena cobertura.
 */
describe('prepareReconcileRegisteredPago', () => {
  const localPago = {
    id: 'local-1',
    negocioId: 'neg-1',
    cuotaId: null,
    amount: 50000,
    paidAt: '2026-09-09T10:00:00.000Z',
    receiptNumber: 'R-1',
    virtualReceiptNumber: null,
    receiptStatus: 'emitido',
    notes: null,
    createdByName: 'Gestor Pérez',
    paymentMethodId: 'pm-1',
    paymentMethodName: 'Efectivo',
    paymentSite: 'app_movil',
    prepareDestroyPermanently: () => ({ op: 'destroy' }),
  };

  function fakeDatabase(created: Record<string, unknown>[]) {
    return {
      get: (table: string) => ({
        find: async (id: string) => {
          if (table === 'negocio_pagos' && id === 'local-1') return localPago;
          throw new Error('not found');
        },
        prepareCreate: (mutate: (row: Record<string, unknown>) => void) => {
          const row: Record<string, unknown> = { _raw: { id: '' } };
          mutate(row);
          created.push(row);
          return row;
        },
        query: () => ({ fetch: async () => [] }),
      }),
    };
  }

  it('copia método y sitio de pago a la fila con el id del servidor', async () => {
    const created: Record<string, unknown>[] = [];
    const changes = new PreparedChanges();
    const payload = { pagoLocalId: 'local-1' } as RegisterPagoPayload;

    await prepareReconcileRegisteredPago(
      fakeDatabase(created) as never,
      payload,
      'server-1',
      changes
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      _raw: { id: 'server-1' },
      negocioId: 'neg-1',
      amount: 50000,
      createdByName: 'Gestor Pérez',
      paymentMethodId: 'pm-1',
      paymentMethodName: 'Efectivo',
      paymentSite: 'app_movil',
      rowSyncStatus: 'synced',
    });
  });

  it('no hace nada si el servidor devolvió el mismo id local', async () => {
    const created: Record<string, unknown>[] = [];
    const changes = new PreparedChanges();
    const payload = { pagoLocalId: 'local-1' } as RegisterPagoPayload;

    await prepareReconcileRegisteredPago(
      fakeDatabase(created) as never,
      payload,
      'local-1',
      changes
    );

    expect(created).toHaveLength(0);
  });
});

/**
 * Un pago rechazado no puede desaparecer del teléfono: el cliente ya se llevó
 * el recibo impreso. La fila queda marcada con el motivo y el saldo y las
 * cuotas vuelven a como estaban, que es lo que el servidor tiene por cierto.
 */
describe('prepareRevertCommand con un pago rechazado', () => {
  type Row = Record<string, unknown> & { prepareUpdate: (mutate: (draft: any) => void) => unknown };

  function row(fields: Record<string, unknown>): Row {
    const record: Row = {
      ...fields,
      prepareUpdate: (mutate: (draft: any) => void) => {
        const changes: Record<string, unknown> = {};
        mutate(changes);
        return { op: 'update', id: fields.id, changes };
      },
    };
    return record;
  }

  function buildDatabase(pago: Row, cuota: Row, negocio: Row) {
    const tables: Record<string, Row[]> = {
      negocio_pagos: [pago],
      negocio_cuotas: [cuota],
      negocios: [negocio],
      file_uploads: [],
      sync_outbox: [],
    };
    return {
      get: (table: string) => ({
        find: async (id: string) => {
          const found = (tables[table] || []).find((item) => item.id === id);
          if (!found) throw new Error(`${table} ${id} no encontrado`);
          return found;
        },
        query: () => ({ fetch: async () => tables[table] || [] }),
      }),
    };
  }

  const outboxItem = {
    id: 'cmd-1',
    type: 'register_pago',
    lastError: 'El valor supera el saldo',
    payloadJson: JSON.stringify({
      pagoLocalId: 'pago-local',
      negocioId: 'neg-1',
      snapshot: {
        cuotas: [{ id: 'cuota-1', paidAmount: 0, status: 'pendiente', rowSyncStatus: 'synced' }],
        negocio: { id: 'neg-1', remainingBalance: 300_000 },
      },
    }),
  } as never;

  it('marca el pago como rechazado con el motivo en vez de borrarlo', async () => {
    const destroy = jest.fn();
    const pago = row({ id: 'pago-local', rowSyncStatus: 'pending', prepareDestroyPermanently: destroy });
    const cuota = row({ id: 'cuota-1', rowSyncStatus: 'pending' });
    const negocio = row({ id: 'neg-1' });

    const operations = (await prepareRevertCommand(
      buildDatabase(pago, cuota, negocio) as never,
      outboxItem,
      'El valor supera el saldo'
    )) as unknown as { id: string; changes: Record<string, unknown> }[];

    expect(destroy).not.toHaveBeenCalled();
    const pagoUpdate = operations.find((operation) => operation.id === 'pago-local');
    expect(pagoUpdate?.changes).toMatchObject({
      rowSyncStatus: 'rejected',
      rejectedReason: 'El valor supera el saldo',
    });
    expect(typeof pagoUpdate?.changes.rejectedAt).toBe('number');

    // El saldo y la cuota vuelven al estado anterior al cobro.
    expect(operations.find((operation) => operation.id === 'cuota-1')?.changes).toMatchObject({
      paidAmount: 0,
      status: 'pendiente',
    });
    expect(operations.find((operation) => operation.id === 'neg-1')?.changes).toEqual({
      remainingBalance: 300_000,
    });
  });

  it('sin motivo del servidor deja un texto entendible', async () => {
    const pago = row({ id: 'pago-local', rowSyncStatus: 'pending', prepareDestroyPermanently: jest.fn() });
    const operations = (await prepareRevertCommand(
      buildDatabase(pago, row({ id: 'cuota-1', rowSyncStatus: 'pending' }), row({ id: 'neg-1' })) as never,
      outboxItem,
      null
    )) as unknown as { id: string; changes: Record<string, unknown> }[];

    expect(operations.find((operation) => operation.id === 'pago-local')?.changes).toMatchObject({
      rejectedReason: DEFAULT_REJECTED_PAGO_REASON,
    });
  });
});
