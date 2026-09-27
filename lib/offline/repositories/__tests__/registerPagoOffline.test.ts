/**
 * Cobro sin red: fila optimista + cuotas FIFO + saldo del negocio + comando en
 * el outbox, en un único batch. Lo que viaje en el payload es lo que llega al
 * RPC al sincronizar (método y sitio de pago incluidos).
 */
import {
  deleteRejectedPagoLocal,
  fetchNegocioDetailFromLocal,
  listRejectedPagosFromLocal,
  registerPagoOffline,
  registerPagoWithFallback,
} from '../offlineRepository';

type Op = { op: 'create' | 'update'; table?: string; id?: string; changes: Record<string, unknown> };

const mockBatch = jest.fn();
const mockPrepareOutboxRecord = jest.fn();
const mockRunSync = jest.fn();
const mockRefreshPendingCount = jest.fn();
let mockTables: Record<string, Array<Record<string, unknown>>> = {};
let mockKeySeq = 0;

function mockRecord(table: string, fields: Record<string, unknown>) {
  return {
    ...fields,
    prepareUpdate: (fn: (draft: Record<string, unknown>) => void): Op => {
      const changes: Record<string, unknown> = {};
      fn(changes);
      return { op: 'update', table, id: String(fields.id), changes };
    },
  };
}

jest.mock('@/lib/offline/database', () => ({
  isDatabaseOpen: () => true,
  getDatabase: () => ({
    get: (table: string) => ({
      find: async (id: string) => {
        const row = (mockTables[table] || []).find((item) => item.id === id);
        if (!row) throw new Error(`${table} ${id} no encontrado`);
        return row;
      },
      query: (...clauses: unknown[][]) => ({
        fetch: async () =>
          (mockTables[table] || []).filter((row) =>
            clauses.every(([column, value]) => {
              if (column === 'negocio_id') return row.negocioId === value;
              if (column === 'route_id') return row.routeId === value;
              if (column === 'status' && table === 'collection_route_stops') return row.status === value;
              return true;
            })
          ),
      }),
      prepareCreate: (fn: (record: Record<string, unknown>) => void): Op => {
        const record: Record<string, unknown> = { _raw: {} };
        fn(record);
        return { op: 'create', table, changes: record };
      },
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: (...ops: Op[]) => mockBatch(...ops),
  }),
}));

jest.mock('@/lib/offline/sync/outbox', () => ({
  prepareOutboxRecord: (...args: unknown[]) => mockPrepareOutboxRecord(...args),
}));

jest.mock('@/lib/offline/sync/reconcile', () => ({ prepareRevertCommand: jest.fn() }));

jest.mock('@/lib/offline/sync/syncEngine', () => ({
  runSync: (...args: unknown[]) => mockRunSync(...args),
  refreshPendingCount: (...args: unknown[]) => mockRefreshPendingCount(...args),
}));

jest.mock('@/lib/offline/security/localFiles', () => ({
  persistPagoSupportFile: jest.fn(),
  deleteLocalPagoSupportFile: jest.fn(),
}));

jest.mock('@/lib/uploadPagoSupport', () => ({ PAGO_SUPPORT_BUCKET: 'pago-supports' }));

jest.mock('@/lib/idempotency', () => ({
  createIdempotencyKey: () => `key-${++mockKeySeq}`,
}));

function seed() {
  mockTables = {
    negocios: [mockRecord('negocios', { id: 'neg-1', remainingBalance: 300_000 })],
    negocio_cuotas: [
      mockRecord('negocio_cuotas', {
        id: 'cuota-2', negocioId: 'neg-1', dueDate: '2026-10-01', amount: 100_000,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
      mockRecord('negocio_cuotas', {
        id: 'cuota-1', negocioId: 'neg-1', dueDate: '2026-09-01', amount: 100_000,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
      mockRecord('negocio_cuotas', {
        id: 'cuota-3', negocioId: 'neg-1', dueDate: '2026-11-01', amount: 100_000,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
      mockRecord('negocio_cuotas', {
        id: 'otra', negocioId: 'neg-9', dueDate: '2026-08-01', amount: 999_999,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
    ],
  };
}

const baseInput = {
  negocioId: 'neg-1',
  amount: 150_000,
  paidAt: '2026-09-10T15:00:00.000Z',
  receiptNumber: 'R-77',
  paymentMethodId: 'pm-1',
  paymentMethodName: 'Efectivo',
  registeredBy: 'Gestor Uno',
};

describe('registerPagoOffline', () => {
  beforeEach(() => {
    mockKeySeq = 0;
    mockBatch.mockReset();
    mockRunSync.mockReset();
    mockRefreshPendingCount.mockReset();
    mockPrepareOutboxRecord.mockReset();
    mockPrepareOutboxRecord.mockImplementation((_db, type, payload, key) => ({
      op: 'create',
      table: 'sync_outbox',
      changes: { type, payload, key },
    }));
    seed();
  });

  it('guarda el pago con método y sitio app_movil, aplica FIFO y encola el comando', async () => {
    const result = await registerPagoOffline({ ...baseInput, idempotencyKey: 'idem-pantalla' });

    expect(result).toEqual({ pagoLocalId: 'key-1', pendingReceipt: true, supportWarning: null, routeStopApplied: false });
    expect(mockBatch).toHaveBeenCalledTimes(1);
    const ops = mockBatch.mock.calls[0] as Op[];

    const pago = ops.find((op) => op.table === 'negocio_pagos');
    expect(pago?.changes).toMatchObject({
      negocioId: 'neg-1',
      cuotaId: null,
      amount: 150_000,
      receiptNumber: 'R-77',
      receiptStatus: 'emitido',
      paymentMethodId: 'pm-1',
      paymentMethodName: 'Efectivo',
      paymentSite: 'app_movil',
      createdByName: 'Gestor Uno',
      rowSyncStatus: 'pending',
    });
    expect((pago?.changes._raw as { id: string }).id).toBe('key-1');

    // FIFO por vencimiento: la cuota de septiembre se paga completa y la de octubre queda parcial.
    const cuotaUpdates = ops.filter((op) => op.table === 'negocio_cuotas');
    expect(cuotaUpdates).toEqual([
      { op: 'update', table: 'negocio_cuotas', id: 'cuota-1', changes: { paidAmount: 100_000, status: 'pagada', rowSyncStatus: 'pending' } },
      { op: 'update', table: 'negocio_cuotas', id: 'cuota-2', changes: { paidAmount: 50_000, status: 'parcial', rowSyncStatus: 'pending' } },
    ]);
    expect(ops.find((op) => op.table === 'negocios')?.changes).toEqual({ remainingBalance: 150_000 });

    const [, type, payload, key] = mockPrepareOutboxRecord.mock.calls[0];
    expect(type).toBe('register_pago');
    expect(key).toBe('idem-pantalla');
    expect(payload).toMatchObject({
      pagoLocalId: 'key-1',
      negocioId: 'neg-1',
      amount: 150_000,
      paymentMethodId: 'pm-1',
      paymentSite: 'app_movil',
      routeStopId: null,
      lane: 'negocio:neg-1',
    });
    // El snapshot guarda el estado previo para poder revertir si el servidor rechaza.
    expect(payload.snapshot.negocio).toEqual({ id: 'neg-1', remainingBalance: 300_000 });
    expect(payload.snapshot.cuotas).toContainEqual({ id: 'cuota-1', paidAmount: 0, status: 'pendiente', rowSyncStatus: 'synced' });
    expect(ops[ops.length - 1].table).toBe('sync_outbox');

    expect(mockRunSync).toHaveBeenCalledWith('mutation');
  });

  it('sin clave de la pantalla genera una propia para el outbox', async () => {
    await registerPagoOffline(baseInput);

    expect(mockPrepareOutboxRecord.mock.calls[0][3]).toBe('key-2');
  });

  it('rechaza un valor mayor que el saldo de las cuotas descargadas sin escribir nada', async () => {
    await expect(registerPagoOffline({ ...baseInput, amount: 300_001 })).rejects.toThrow(
      'El valor supera el saldo pendiente de las cuotas descargadas.'
    );
    expect(mockBatch).not.toHaveBeenCalled();
    expect(mockPrepareOutboxRecord).not.toHaveBeenCalled();
  });

  it('acepta pagar exactamente el saldo y deja el negocio en cero', async () => {
    await registerPagoOffline({ ...baseInput, amount: 300_000 });

    const ops = mockBatch.mock.calls[0] as Op[];
    expect(ops.filter((op) => op.table === 'negocio_cuotas')).toHaveLength(3);
    expect(ops.find((op) => op.table === 'negocios')?.changes).toEqual({ remainingBalance: 0 });
  });

  it('guarda y encola el monto con centavos, sin ruido de coma flotante', async () => {
    await registerPagoOffline({ ...baseInput, amount: 93_333.33 + 0.1 + 0.2 - 0.3 });

    const ops = mockBatch.mock.calls[0] as Op[];
    expect(ops.find((op) => op.table === 'negocio_pagos')?.changes).toMatchObject({ amount: 93_333.33 });
    expect(mockPrepareOutboxRecord.mock.calls[0][2]).toMatchObject({ amount: 93_333.33 });
  });

  it('pide descargar la información si el negocio no está en el dispositivo', async () => {
    await expect(registerPagoOffline({ ...baseInput, negocioId: 'neg-x' })).rejects.toThrow(
      /no está descargado en el dispositivo/
    );
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it('no registra si el negocio no tiene cuotas descargadas', async () => {
    mockTables.negocio_cuotas = [];

    await expect(registerPagoOffline(baseInput)).rejects.toThrow(/No hay cuotas descargadas/);
    expect(mockBatch).not.toHaveBeenCalled();
  });
});

/**
 * Consignación (método con `requires_support`): sin soporte no se guarda el
 * cobro, y el archivo se copia al teléfono ANTES de guardar el pago, para que
 * un fallo al copiarlo no deje un pago de consignación sin soporte.
 */
describe('registerPagoOffline con soporte obligatorio', () => {
  const localFiles = jest.requireMock('@/lib/offline/security/localFiles') as {
    persistPagoSupportFile: jest.Mock;
    deleteLocalPagoSupportFile: jest.Mock;
  };
  const consignacion = {
    ...baseInput,
    paymentMethodId: 'pm-2',
    paymentMethodName: 'Consignación',
    supportRequired: true,
  };
  const file = { uri: 'file:///cache/consignacion.jpg', mimeType: 'image/jpeg', name: 'consignacion.jpg' };

  beforeEach(() => {
    mockKeySeq = 0;
    mockBatch.mockReset();
    mockPrepareOutboxRecord.mockReset();
    mockPrepareOutboxRecord.mockImplementation((_db, type, payload, key) => ({
      op: 'create',
      table: 'sync_outbox',
      changes: { type, payload, key },
    }));
    localFiles.persistPagoSupportFile.mockReset();
    localFiles.deleteLocalPagoSupportFile.mockReset();
    seed();
  });

  it('sin soporte no guarda nada y lo explica', async () => {
    await expect(registerPagoOffline(consignacion)).rejects.toThrow(
      'Este método de pago exige adjuntar el soporte (foto o PDF del comprobante).'
    );
    expect(mockBatch).not.toHaveBeenCalled();
    expect(localFiles.persistPagoSupportFile).not.toHaveBeenCalled();
  });

  it('copia el soporte antes de guardar el pago y lo encola tras el pago, sin copiarlo dos veces', async () => {
    localFiles.persistPagoSupportFile.mockResolvedValue('file:///docs/soportes/copia.jpg');

    const result = await registerPagoOffline({ ...consignacion, supportFile: file });

    expect(result.supportWarning).toBeNull();
    expect(localFiles.persistPagoSupportFile).toHaveBeenCalledTimes(1);
    expect(localFiles.persistPagoSupportFile.mock.invocationCallOrder[0]).toBeLessThan(
      mockBatch.mock.invocationCallOrder[0]
    );
    // Primer batch: el pago; segundo: el archivo y el comando attach_pago_support.
    expect(mockBatch).toHaveBeenCalledTimes(2);
    const uploadOps = mockBatch.mock.calls[1] as Op[];
    expect(uploadOps.find((op) => op.table === 'file_uploads')?.changes).toMatchObject({
      localUri: 'file:///docs/soportes/copia.jpg',
      pagoLocalId: 'key-1',
      status: 'pending',
    });
    const attach = mockPrepareOutboxRecord.mock.calls.find(([, type]) => type === 'attach_pago_support');
    expect(attach?.[2]).toMatchObject({ negocioId: 'neg-1', pagoLocalId: 'key-1', lane: 'negocio:neg-1' });
  });

  it('si no se puede copiar el soporte, el cobro no se guarda', async () => {
    localFiles.persistPagoSupportFile.mockRejectedValue(new Error('Sin espacio en el teléfono'));

    await expect(registerPagoOffline({ ...consignacion, supportFile: file })).rejects.toThrow('Sin espacio en el teléfono');
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it('si falla el guardado del pago, borra la copia del soporte', async () => {
    localFiles.persistPagoSupportFile.mockResolvedValue('file:///docs/soportes/copia.jpg');
    mockBatch.mockRejectedValueOnce(new Error('disco lleno'));

    await expect(registerPagoOffline({ ...consignacion, supportFile: file })).rejects.toThrow('disco lleno');
    expect(localFiles.deleteLocalPagoSupportFile).toHaveBeenCalledWith('file:///docs/soportes/copia.jpg');
  });

  it('con un método sin soporte obligatorio conserva el flujo de siempre (copia después del pago)', async () => {
    localFiles.persistPagoSupportFile.mockResolvedValue('file:///docs/soportes/copia.jpg');

    await registerPagoOffline({ ...baseInput, supportFile: file });

    expect(mockBatch.mock.invocationCallOrder[0]).toBeLessThan(
      localFiles.persistPagoSupportFile.mock.invocationCallOrder[0]
    );
  });
});

/**
 * El caso real de campo: con señal débil la petición puede tardar el tiempo
 * límite completo antes de fallar. Si el estado de conexión ya dice que no hay
 * red, el cobro se guarda directo en el teléfono sin tocar el servidor.
 */
describe('registerPagoWithFallback', () => {
  it('sin red guarda sin conexión y no intenta el servidor', async () => {
    const registerOnline = jest.fn(async () => 'servidor');
    const registerOffline = jest.fn(async () => 'local');

    const result = await registerPagoWithFallback({
      online: false,
      registerOnline,
      registerOffline,
    });

    expect(result).toBe('local');
    expect(registerOnline).not.toHaveBeenCalled();
    expect(registerOffline).toHaveBeenCalledTimes(1);
  });

  it('con red intenta el servidor primero', async () => {
    const registerOnline = jest.fn(async () => 'servidor');
    const registerOffline = jest.fn(async () => 'local');

    await expect(
      registerPagoWithFallback({ online: true, registerOnline, registerOffline })
    ).resolves.toBe('servidor');
    expect(registerOffline).not.toHaveBeenCalled();
  });

  it('si la petición no llega (tiempo límite) cae al camino sin conexión', async () => {
    const registerOnline = jest.fn(async () => {
      throw new Error('La red no respondió a tiempo.');
    });
    const registerOffline = jest.fn(async () => 'local');

    await expect(
      registerPagoWithFallback({ online: true, registerOnline, registerOffline })
    ).resolves.toBe('local');
  });

  it('un rechazo del servidor se propaga: no se guarda una copia local', async () => {
    const registerOnline = jest.fn(async () => {
      throw new Error('El valor supera el saldo');
    });
    const registerOffline = jest.fn(async () => 'local');

    await expect(
      registerPagoWithFallback({ online: true, registerOnline, registerOffline })
    ).rejects.toThrow('El valor supera el saldo');
    expect(registerOffline).not.toHaveBeenCalled();
  });
});

/**
 * Tras un rechazo el pago sigue en el teléfono: se muestra aparte (no suma al
 * saldo) y solo desaparece cuando la persona lo elimina a propósito.
 */
describe('pagos rechazados guardados en el teléfono', () => {
  const destroyPermanently = jest.fn();

  function pagoRow(fields: Record<string, unknown>) {
    return { ...mockRecord('negocio_pagos', fields), destroyPermanently };
  }

  beforeEach(() => {
    destroyPermanently.mockReset();
    seed();
    mockTables.customers = [mockRecord('customers', { id: 'cli-1', name: 'Ana', idNumber: '1', phone: null })];
    mockTables.negocios = [
      mockRecord('negocios', {
        id: 'neg-1', numero: 20260001, status: 'activo', dealDate: null, totalCredit: 300_000,
        remainingBalance: 300_000, customerId: 'cli-1', codeudorCustomerId: null, direccion: null,
        municipioId: null, municipioName: null, sellerId: null, gestorCobroId: null,
      }),
    ];
    mockTables.negocio_pagos = [
      pagoRow({
        id: 'pago-ok', negocioId: 'neg-1', amount: 50_000, paidAt: '2026-09-20T10:00:00.000Z',
        receiptNumber: 'R-1', receiptStatus: 'emitido', rowSyncStatus: 'synced',
      }),
      pagoRow({
        id: 'pago-en-cola', negocioId: 'neg-1', amount: 40_000, paidAt: '2026-09-21T10:00:00.000Z',
        receiptNumber: 'R-2', receiptStatus: 'emitido', rowSyncStatus: 'pending',
      }),
      pagoRow({
        id: 'pago-rechazado', negocioId: 'neg-1', amount: 30_000, paidAt: '2026-09-22T10:00:00.000Z',
        receiptNumber: 'R-3', receiptStatus: 'emitido', rowSyncStatus: 'rejected',
        rejectedReason: 'El valor supera el saldo', rejectedAt: 1_700_000_000_000,
        paymentMethodName: 'Efectivo', createdByName: 'Gestor Uno',
      }),
    ];
  });

  it('el detalle separa el rechazado y marca el que sigue en la cola', async () => {
    const detail = await fetchNegocioDetailFromLocal('neg-1');

    expect(detail?.pagos.map((pago) => pago.id)).toEqual(['pago-en-cola', 'pago-ok']);
    expect(detail?.pagos.find((pago) => pago.id === 'pago-en-cola')?.pending_confirmation).toBe(true);
    expect(detail?.pagos.find((pago) => pago.id === 'pago-ok')?.pending_confirmation).toBe(false);
    expect(detail?.rejectedPagos).toEqual([
      {
        id: 'pago-rechazado',
        negocioId: 'neg-1',
        amount: 30_000,
        paidAt: '2026-09-22T10:00:00.000Z',
        receiptNumber: 'R-3',
        paymentMethodName: 'Efectivo',
        createdByName: 'Gestor Uno',
        rejectedReason: 'El valor supera el saldo',
        rejectedAt: 1_700_000_000_000,
      },
    ]);
  });

  it('solo se borra el pago rechazado, y solo cuando se pide', async () => {
    expect((await listRejectedPagosFromLocal('neg-1')).map((pago) => pago.id)).toEqual(['pago-rechazado']);
    expect(await deleteRejectedPagoLocal('pago-en-cola')).toBe(false);
    expect(destroyPermanently).not.toHaveBeenCalled();

    expect(await deleteRejectedPagoLocal('pago-rechazado')).toBe(true);
    expect(destroyPermanently).toHaveBeenCalledTimes(1);
  });
});

describe('registerPagoOffline desde una parada de ruta', () => {
  const stop = (id: string, status: string, position: number) =>
    mockRecord('collection_route_stops', { id, routeId: 'ruta-1', negocioId: id === 's1' ? 'neg-1' : `neg-${id}`, status, position });

  beforeEach(() => {
    mockKeySeq = 0;
    mockBatch.mockReset();
    mockPrepareOutboxRecord.mockReset();
    mockPrepareOutboxRecord.mockImplementation((_db, type, payload, key) => ({
      op: 'create',
      table: 'sync_outbox',
      changes: { type, payload, key },
    }));
    seed();
  });

  it('con la parada «actual»: la completa, adelanta la siguiente y viaja como cobro de ruta', async () => {
    mockTables.collection_route_stops = [stop('s1', 'actual', 1), stop('s2', 'pendiente', 2)];
    const result = await registerPagoOffline({ ...baseInput, amount: 50_000, routeStopId: 's1' });
    const ops = mockBatch.mock.calls[0] as Op[];
    const stopOps = ops.filter((op) => op.table === 'collection_route_stops');
    expect(stopOps).toEqual([
      expect.objectContaining({ id: 's1', changes: expect.objectContaining({ status: 'cobrado' }) }),
      expect.objectContaining({ id: 's2', changes: expect.objectContaining({ status: 'actual' }) }),
    ]);
    const outbox = ops.find((op) => op.table === 'sync_outbox');
    expect(outbox?.changes.type).toBe('register_route_pago');
    expect((outbox?.changes.payload as { routeStopId: string }).routeStopId).toBe('s1');
    expect(result.routeStopApplied).toBe(true);
  });

  it('con la parada ya cobrada: abono normal, sin tocar la ruta (no se adelanta otra parada)', async () => {
    mockTables.collection_route_stops = [stop('s1', 'cobrado', 1), stop('s2', 'actual', 2), stop('s3', 'pendiente', 3)];
    const result = await registerPagoOffline({ ...baseInput, amount: 50_000, routeStopId: 's1' });
    const ops = mockBatch.mock.calls[0] as Op[];
    expect(ops.filter((op) => op.table === 'collection_route_stops')).toEqual([]);
    const outbox = ops.find((op) => op.table === 'sync_outbox');
    expect(outbox?.changes.type).toBe('register_pago');
    const payload = outbox?.changes.payload as { routeStopId: string | null; routeId: string | null; snapshot: { stops: unknown[] } };
    expect(payload.routeStopId).toBeNull();
    expect(payload.routeId).toBeNull();
    expect(payload.snapshot.stops).toEqual([]);
    expect(result.routeStopApplied).toBe(false);
  });

  it('sin la parada en el teléfono: viaja como cobro de ruta y decide el servidor', async () => {
    mockTables.collection_route_stops = [];
    const result = await registerPagoOffline({ ...baseInput, amount: 50_000, routeStopId: 'desconocida' });
    const outbox = (mockBatch.mock.calls[0] as Op[]).find((op) => op.table === 'sync_outbox');
    expect(outbox?.changes.type).toBe('register_route_pago');
    expect(result.routeStopApplied).toBe(true);
  });
});
