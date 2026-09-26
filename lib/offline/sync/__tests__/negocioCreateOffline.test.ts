import { supabase } from '@/lib/supabase';
import { useSyncStore } from '../../store/syncStore';
import { uploadNegocioSignature } from '@/lib/uploadSignature';
import {
  enqueueNegocioCreateOffline,
  prepareRejectedNegocio,
  pushCreateNegocio,
  pushUploadNegocioSignature,
} from '../negocioCreateCommand';
import { PreparedChanges } from '../reconcile';
import type { CreateNegocioPayload } from '../types';

/**
 * Negocio creado sin señal: se encola con sus firmas delante y se reenvía tal
 * cual al volver la red. Si el servidor lo rechaza, la fila local no se borra.
 */

type FakeRecord = Record<string, any>;

const mockDb = createFakeDatabase();

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('../../database', () => ({
  getDatabase: () => mockDb,
  isDatabaseOpen: () => true,
}));

jest.mock('@/lib/uploadSignature', () => {
  const actual = jest.requireActual('@/lib/uploadSignature');
  return { ...actual, uploadNegocioSignature: jest.fn(async () => 'ruta/subida.png') };
});

jest.mock('../../security/localFiles', () => ({
  persistNegocioSignatureFile: jest.fn(async (_source: string, localId: string, role: string) =>
    `file:///firmas/${localId}-${role}.png`
  ),
  deleteLocalPagoSupportFile: jest.fn(async () => undefined),
  localFileExists: jest.fn(async () => true),
}));

function createFakeDatabase() {
  const rows: FakeRecord[] = [];
  const batches: FakeRecord[][] = [];
  let seq = 0;

  const columnValue = (record: FakeRecord, column: string) => {
    const camel = column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    return record[camel] !== undefined ? record[camel] : record[column];
  };

  const matches = (record: FakeRecord, conditions: any[]) =>
    conditions.every((condition) => {
      const [column, expected] = condition as [string, unknown];
      const actual = columnValue(record, column);
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    });

  const collection = (table: string) => ({
    prepareCreate: (fill: (record: FakeRecord) => void) => {
      const record: FakeRecord = { _raw: { id: '' }, __table: table };
      record.prepareUpdate = (fn: (row: FakeRecord) => void) => {
        fn(record);
        return record;
      };
      record.update = async (fn: (row: FakeRecord) => void) => fn(record);
      record.prepareDestroyPermanently = () => {
        const index = rows.indexOf(record);
        if (index >= 0) rows.splice(index, 1);
        return record;
      };
      fill(record);
      record.id = record._raw.id || `${table}-${++seq}`;
      rows.push(record);
      return record;
    },
    find: async (id: string) => {
      const found = rows.find((row) => row.__table === table && row.id === id);
      if (!found) throw new Error('not found');
      return found;
    },
    query: (...conditions: any[]) => ({
      fetch: async () => rows.filter((row) => row.__table === table && matches(row, conditions)),
      fetchCount: async () =>
        rows.filter((row) => row.__table === table && matches(row, conditions)).length,
    }),
  });

  return {
    get: collection,
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: async (...operations: FakeRecord[]) => {
      batches.push(operations);
    },
    __rows: rows,
    __batches: batches,
    __table: (table: string) => rows.filter((row) => row.__table === table),
    __reset: () => {
      rows.length = 0;
      batches.length = 0;
      seq = 0;
    },
  };
}

const NEGOCIO_ARGS = {
  deal_date: '2026-09-23',
  municipio_id: 'm1',
  direccion: 'Vereda La Esperanza',
  customer_id: 'c1',
  codeudor_customer_id: null,
  seller_id: 'u1',
  total_credit: 1200000,
};

async function enqueue() {
  return enqueueNegocioCreateOffline({
    negocioId: 'neg-local-1',
    idempotencyKey: 'idem-1',
    negocio: NEGOCIO_ARGS,
    items: [{ product_id: 'p1', warehouse_id: 'w1', quantity: 1, unit_price: 1200000, subtotal: 1200000 }],
    signatures: [
      { role: 'cliente', value: 'data:image/png;base64,AAAA' },
      { role: 'fiador', value: null },
      { role: 'vendedor', value: 'data:image/png;base64,BBBB' },
    ],
    local: {
      dealDate: '2026-09-23',
      totalCredit: 1200000,
      customerId: 'c1',
      customerName: 'Ana Pérez',
      codeudorCustomerId: null,
      direccion: 'Vereda La Esperanza',
      municipioId: 'm1',
      municipioName: 'Andes',
      sellerId: 'u1',
      sellerName: 'Vendedor',
    },
  });
}

function queuedPayload(): CreateNegocioPayload {
  const item = mockDb.__table('sync_outbox').find((row) => row.type === 'create_negocio');
  return JSON.parse(item!.payloadJson) as CreateNegocioPayload;
}

describe('negocio creado sin señal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.__reset();
    useSyncStore.setState({ userId: 'u1', online: false });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'neg-local-1', error: null });
  });

  it('encola las firmas ANTES del negocio y en el mismo carril', async () => {
    await enqueue();

    const outbox = mockDb.__table('sync_outbox');
    expect(outbox.map((row) => row.type)).toEqual([
      'upload_negocio_signature',
      'upload_negocio_signature',
      'create_negocio',
    ]);
    // El fiador no firmó: sólo viajan las dos firmas capturadas.
    expect(mockDb.__table('file_uploads')).toHaveLength(2);
    const lanes = outbox.map((row) => JSON.parse(row.payloadJson).lane);
    expect(new Set(lanes)).toEqual(new Set(['negocio:neg-local-1']));
  });

  it('guarda el negocio en el teléfono, sin número y pendiente de confirmar', async () => {
    await enqueue();

    const [negocio] = mockDb.__table('negocios');
    expect(negocio).toMatchObject({
      id: 'neg-local-1',
      numero: 0,
      status: 'por_firmar',
      rowSyncStatus: 'pending',
      rejectedReason: null,
    });
  });

  it('la ruta de cada firma se decide al encolar y entra en el negocio', async () => {
    await enqueue();

    const payload = queuedPayload();
    expect(payload.negocio.customer_signature_url).toMatch(/^u1\/neg-local-1\/cliente-/);
    expect(payload.negocio.seller_signature_url).toMatch(/^u1\/neg-local-1\/vendedor-/);
    expect(payload.negocio.guarantor_signature_url).toBeNull();
    // Nunca se activa sin señal: activar mueve stock.
    expect(payload.activate).toBe(false);
  });

  it('no envía el negocio mientras alguna firma siga sin subir', async () => {
    await enqueue();

    const result = await pushCreateNegocio(queuedPayload(), 'idem-1');

    expect(result.outcome).toBe('retry');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('al volver la red reenvía el RPC tal cual, y un reintento manda lo mismo', async () => {
    await enqueue();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    const payload = queuedPayload();

    await pushCreateNegocio(payload, 'idem-1');
    await pushCreateNegocio(payload, 'idem-1');

    const [first, second] = (supabase.rpc as jest.Mock).mock.calls;
    expect(first[0]).toBe('create_negocio');
    expect(first[1]).toMatchObject({
      p_negocio_id: 'neg-local-1',
      p_idempotency_key: 'idem-1',
      p_activate: false,
    });
    expect(first[1].p_negocio).toMatchObject(NEGOCIO_ARGS);
    // Mismo cuerpo byte a byte: el servidor hashea `p_negocio` contra la clave.
    expect(JSON.stringify(second[1])).toBe(JSON.stringify(first[1]));
  });

  it('la falta de existencias se marca como rechazo, no como reintento eterno', async () => {
    await enqueue();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Stock insuficiente para "Nevera" en Bodega Andes. Disponible: 0, solicitado: 1.' },
    });

    const result = await pushCreateNegocio(queuedPayload(), 'idem-1');

    expect(result.outcome).toBe('fail');
    expect(result.outcome === 'fail' && result.message).toMatch(/Stock insuficiente/);
  });

  it.each([
    'La orden de entrega está cancelada',
    'La orden de cliente ya está vinculada a un negocio',
    'La orden de entrega de origen no existe',
    'La remisión de destino no existe o no es válida',
    'Solo se puede enviar el negocio en una remisión pendiente',
    'La remisión no cuenta con suficiente saldo para "Mesa". Disponible en remisión: 1, Solicitado: 3.',
  ])('un origen que cambió sin señal es rechazo definitivo con motivo: %s', async (message) => {
    await enqueue();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message } });

    const result = await pushCreateNegocio(queuedPayload(), 'idem-1');

    expect(result).toEqual({ outcome: 'fail', message });
  });

  it('un error desconocido del servidor sigue siendo reintentable', async () => {
    await enqueue();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'deadlock detected' } });

    await expect(pushCreateNegocio(queuedPayload(), 'idem-1')).rejects.toMatchObject({
      message: 'deadlock detected',
    });
  });

  it('sube cada firma a la ruta ya decidida y pisa lo subido en un reintento', async () => {
    await enqueue();
    const firma = JSON.parse(
      mockDb.__table('sync_outbox').find((row) => row.type === 'upload_negocio_signature')!.payloadJson
    );

    const result = await pushUploadNegocioSignature(firma);

    expect(result.outcome).toBe('done');
    expect(uploadNegocioSignature).toHaveBeenCalledWith(
      expect.stringContaining('file:///firmas/'),
      expect.objectContaining({ path: firma.storagePath, upsert: true, role: 'cliente' })
    );
    expect(mockDb.__table('file_uploads')[0].status).toBe('done');
  });

  it('el rechazo deja el negocio visible con su motivo (no lo borra)', async () => {
    await enqueue();
    const changes = new PreparedChanges();

    await prepareRejectedNegocio(
      mockDb as never,
      queuedPayload(),
      'Stock insuficiente para "Nevera" en Bodega Andes.',
      changes
    );
    changes.build();

    const [negocio] = mockDb.__table('negocios');
    expect(negocio.rowSyncStatus).toBe('rejected');
    expect(negocio.rejectedReason).toMatch(/Stock insuficiente/);
    expect(negocio.rejectedAt).toEqual(expect.any(Number));
    // Las firmas que no llegaron a subir se descartan con él.
    expect(mockDb.__table('file_uploads').map((row) => row.status)).toEqual(['failed', 'failed']);
  });
});
