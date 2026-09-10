import { PreparedChanges, prepareReconcileRegisteredPago } from '../reconcile';
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
