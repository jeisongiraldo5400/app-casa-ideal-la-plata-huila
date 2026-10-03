import { supabase } from '@/lib/supabase';
import { useSyncStore } from '../../store/syncStore';
import { uploadNegocioSignature } from '@/lib/uploadSignature';
import { NegocioPhotoUploadError, uploadNegocioPhoto } from '@/lib/negocioPhotos';
import { deleteLocalPagoSupportFile, localFileExists } from '../../security/localFiles';
import {
  enqueueNegocioCreateOffline,
  prepareRejectedNegocio,
  prepareRetryNegocio,
  pushCreateNegocio,
  pushUploadNegocioSignature,
  type NegocioPhotoInput,
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

jest.mock('@/lib/negocioPhotos', () => {
  const actual = jest.requireActual('@/lib/negocioPhotos');
  return { ...actual, uploadNegocioPhoto: jest.fn(async (_uri: string, opts: { path: string }) => opts.path) };
});

jest.mock('../../security/localFiles', () => ({
  persistNegocioPhotoFile: jest.fn(async (_source: string, localId: string, ext: string) =>
    `file:///fotos/${localId}.${ext}`
  ),
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

async function enqueue(photos?: NegocioPhotoInput[]) {
  return enqueueNegocioCreateOffline({
    photos,
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

const FOTOS: NegocioPhotoInput[] = [
  { kind: 'cliente', uri: 'file:///cache/cliente.jpg', mimeType: 'image/jpeg', storagePath: 'u1/foto-1.jpg' },
  { kind: 'cedula', uri: 'file:///cache/cedula.png', mimeType: 'image/png', storagePath: 'u1/foto-2.png' },
];

function outboxPayloads(type: string) {
  return mockDb
    .__table('sync_outbox')
    .filter((row) => row.type === type)
    .map((row) => JSON.parse(row.payloadJson));
}

describe('negocio creado sin señal · fotos del cliente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.__reset();
    useSyncStore.setState({ userId: 'u1', online: false });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'neg-local-1', error: null });
    (localFileExists as jest.Mock).mockResolvedValue(true);
  });

  it('sin fotos: ni rutas de foto en el negocio ni `bucket` en las firmas (forma de siempre)', async () => {
    await enqueue();

    const payload = queuedPayload();
    expect(payload.negocio).not.toHaveProperty('customer_photo_path');
    expect(payload.negocio).not.toHaveProperty('customer_id_photo_path');
    for (const firma of outboxPayloads('upload_negocio_signature')) expect(firma).not.toHaveProperty('bucket');
  });

  it('encola las fotos antes del negocio, en su carril, y el negocio ya lleva sus rutas', async () => {
    await enqueue(FOTOS);

    const outbox = mockDb.__table('sync_outbox');
    expect(outbox.map((row) => row.type)).toEqual([
      'upload_negocio_signature',
      'upload_negocio_signature',
      'upload_negocio_signature',
      'upload_negocio_signature',
      'create_negocio',
    ]);
    expect(new Set(outbox.map((row) => JSON.parse(row.payloadJson).lane))).toEqual(new Set(['negocio:neg-local-1']));
    const fotos = outboxPayloads('upload_negocio_signature').filter((row) => row.bucket === 'negocios-fotos');
    expect(fotos.map((row) => [row.role, row.storagePath])).toEqual([
      ['foto_cliente', 'u1/foto-1.jpg'],
      ['foto_cedula', 'u1/foto-2.png'],
    ]);
    const uploads = mockDb.__table('file_uploads').filter((row) => row.bucket === 'negocios-fotos');
    expect(uploads.map((row) => [row.fileName, row.mime])).toEqual([
      ['foto-cliente.jpg', 'image/jpeg'],
      ['foto-cedula.png', 'image/png'],
    ]);
    expect(uploads[0].localUri).toMatch(/^file:\/\/\/fotos\//);
    expect(queuedPayload().negocio).toMatchObject({
      customer_photo_path: 'u1/foto-1.jpg',
      customer_id_photo_path: 'u1/foto-2.png',
    });
  });

  it('la cédula por atrás viaja por la cola con su rol, su archivo y su clave en p_negocio', async () => {
    await enqueue([
      ...FOTOS,
      { kind: 'cedula_atras', uri: 'file:///cache/atras.jpg', mimeType: 'image/jpeg', storagePath: 'u1/foto-3.jpg' },
    ]);

    const fotos = outboxPayloads('upload_negocio_signature').filter((row) => row.bucket === 'negocios-fotos');
    expect(fotos.map((row) => [row.role, row.storagePath])).toEqual([
      ['foto_cliente', 'u1/foto-1.jpg'],
      ['foto_cedula', 'u1/foto-2.png'],
      ['foto_cedula_atras', 'u1/foto-3.jpg'],
    ]);
    const uploads = mockDb.__table('file_uploads').filter((row) => row.bucket === 'negocios-fotos');
    expect(uploads.map((row) => row.fileName)).toEqual(['foto-cliente.jpg', 'foto-cedula.png', 'foto-cedula_atras.jpg']);
    expect(queuedPayload().negocio).toMatchObject({
      customer_photo_path: 'u1/foto-1.jpg',
      customer_id_photo_path: 'u1/foto-2.png',
      customer_id_back_photo_path: 'u1/foto-3.jpg',
    });

    const atras = fotos[2];
    await pushUploadNegocioSignature(atras);
    expect(uploadNegocioPhoto).toHaveBeenCalledWith(expect.any(String), {
      path: 'u1/foto-3.jpg',
      mimeType: 'image/jpeg',
      kind: 'cedula_atras',
    });
  });

  it('la cédula por atrás que no sube se quita sola, con su nombre en el aviso', async () => {
    await enqueue([
      ...FOTOS,
      { kind: 'cedula_atras', uri: 'file:///cache/atras.jpg', mimeType: 'image/jpeg', storagePath: 'u1/foto-3.jpg' },
    ]);
    (localFileExists as jest.Mock).mockResolvedValue(false);
    const atras = outboxPayloads('upload_negocio_signature').find((row) => row.role === 'foto_cedula_atras');

    const result = await pushUploadNegocioSignature(atras);

    expect(result).toEqual({
      outcome: 'done',
      note: 'La foto de la cédula (atrás) no se pudo subir (ya no está guardada en el teléfono); el negocio se sincroniza sin ella.',
    });
    expect(queuedPayload().negocio).not.toHaveProperty('customer_id_back_photo_path');
    expect(queuedPayload().negocio.customer_id_photo_path).toBe('u1/foto-2.png');
    expect(queuedPayload().skippedPhotos).toEqual(['customer_id_back_photo_path']);
  });

  it('una foto ya subida con red solo aporta su ruta (no se vuelve a subir)', async () => {
    await enqueue([{ ...FOTOS[0], uploaded: true }]);

    expect(mockDb.__table('file_uploads').filter((row) => row.bucket === 'negocios-fotos')).toHaveLength(0);
    expect(queuedPayload().negocio.customer_photo_path).toBe('u1/foto-1.jpg');
  });

  it('sube la foto a negocios-fotos (no como firma) y borra el archivo local', async () => {
    await enqueue(FOTOS);
    const foto = outboxPayloads('upload_negocio_signature').find((row) => row.role === 'foto_cedula');

    const result = await pushUploadNegocioSignature(foto);

    expect(result.outcome).toBe('done');
    expect(uploadNegocioPhoto).toHaveBeenCalledWith(expect.stringContaining('file:///fotos/'), {
      path: 'u1/foto-2.png',
      mimeType: 'image/png',
      kind: 'cedula',
    });
    expect(uploadNegocioSignature).not.toHaveBeenCalled();
    expect(deleteLocalPagoSupportFile).toHaveBeenCalledWith(expect.stringContaining('file:///fotos/'));
  });

  it('un comando de firma encolado antes de las fotos (sin `bucket`) se sigue subiendo como firma', async () => {
    const upload = mockDb.get('file_uploads').prepareCreate((record: Record<string, unknown>) => {
      record.localUri = 'file:///firmas/vieja-cliente.png';
      record.mime = 'image/png';
      record.fileName = 'firma-cliente.png';
      record.bucket = 'negocios-firmas';
      record.negocioId = 'neg-viejo';
      record.status = 'pending';
    });

    const result = await pushUploadNegocioSignature({
      lane: 'negocio:neg-viejo',
      fileUploadId: upload.id,
      negocioId: 'neg-viejo',
      role: 'cliente',
      storagePath: 'u1/neg-viejo/cliente-x.png',
    });

    expect(result.outcome).toBe('done');
    expect(uploadNegocioSignature).toHaveBeenCalledWith('file:///firmas/vieja-cliente.png', {
      negocioId: 'neg-viejo',
      role: 'cliente',
      path: 'u1/neg-viejo/cliente-x.png',
      upsert: true,
    });
    expect(uploadNegocioPhoto).not.toHaveBeenCalled();
  });

  it('el negocio espera a que suban sus fotos', async () => {
    await enqueue(FOTOS);
    for (const upload of mockDb.__table('file_uploads')) {
      if (upload.bucket === 'negocios-firmas') upload.status = 'done';
    }

    const result = await pushCreateNegocio(queuedPayload(), 'idem-1');

    expect(result.outcome).toBe('retry');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('con firmas y fotos arriba, envía el RPC con las rutas de las fotos', async () => {
    await enqueue(FOTOS);
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';

    await pushCreateNegocio(queuedPayload(), 'idem-1');

    expect((supabase.rpc as jest.Mock).mock.calls[0][1].p_negocio).toMatchObject({
      customer_photo_path: 'u1/foto-1.jpg',
      customer_id_photo_path: 'u1/foto-2.png',
    });
  });

  function markSent() {
    const item = mockDb.__table('sync_outbox').find((row) => row.type === 'create_negocio')!;
    item.payloadJson = JSON.stringify({ ...JSON.parse(item.payloadJson), rpcSentAt: 1 });
  }

  it('una foto fallida de un negocio que aún no salió se quita: el negocio se envía sin ella y avisa', async () => {
    await enqueue(FOTOS);
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    const cedula = mockDb.__table('file_uploads').find((row) => row.fileName === 'foto-cedula.png')!;
    cedula.status = 'failed';
    cedula.lastError = 'Bucket not found';

    const result = await pushCreateNegocio(queuedPayload(), 'idem-1');

    expect(result.outcome).toBe('done');
    expect(result.outcome === 'done' && result.note).toMatch(/sin la foto de la cédula/);
    const sent = (supabase.rpc as jest.Mock).mock.calls[0][1].p_negocio;
    expect(sent).not.toHaveProperty('customer_id_photo_path');
    expect(sent.customer_photo_path).toBe('u1/foto-1.jpg');
    expect(sent).not.toHaveProperty('rpcSentAt');
    expect(mockDb.__table('file_uploads').some((row) => row.fileName === 'foto-cedula.png')).toBe(false);
    expect(deleteLocalPagoSupportFile).toHaveBeenCalledWith(cedula.localUri);
    // Desde el envío queda marcado: ya no se le quitan fotos.
    expect(queuedPayload().rpcSentAt).toEqual(expect.any(Number));
  });

  it('si el negocio ya salió hacia el servidor, la foto fallida sigue bloqueando (estricto)', async () => {
    await enqueue(FOTOS);
    markSent();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    const cedula = mockDb.__table('file_uploads').find((row) => row.fileName === 'foto-cedula.png')!;
    cedula.status = 'failed';
    cedula.lastError = 'Bucket not found';

    const result = await pushCreateNegocio(queuedPayload(), 'idem-1');

    expect(result).toEqual({ outcome: 'fail', message: 'La foto de la cédula (frente) no se pudo subir: Bucket not found' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('foto perdida del teléfono antes de enviar el negocio: se omite con aviso, sin bloquear', async () => {
    await enqueue(FOTOS);
    (localFileExists as jest.Mock).mockResolvedValue(false);
    const foto = outboxPayloads('upload_negocio_signature').find((row) => row.role === 'foto_cliente');

    const result = await pushUploadNegocioSignature(foto);

    expect(result).toEqual({
      outcome: 'done',
      note: 'La foto del cliente no se pudo subir (ya no está guardada en el teléfono); el negocio se sincroniza sin ella.',
    });
    expect(queuedPayload().negocio).not.toHaveProperty('customer_photo_path');
    expect(queuedPayload().negocio.customer_id_photo_path).toBe('u1/foto-2.png');
    expect(queuedPayload().skippedPhotos).toEqual(['customer_photo_path']);
    expect(uploadNegocioPhoto).not.toHaveBeenCalled();
  });

  it('foto perdida cuando el negocio ya salió: pide volver a tomarla (estricto)', async () => {
    await enqueue(FOTOS);
    markSent();
    (localFileExists as jest.Mock).mockResolvedValue(false);
    const foto = outboxPayloads('upload_negocio_signature').find((row) => row.role === 'foto_cliente');

    const result = await pushUploadNegocioSignature(foto);

    expect(result).toEqual({
      outcome: 'fail',
      message: expect.stringMatching(/^Hay que volver a tomar la foto del cliente/),
    });
    expect(queuedPayload().negocio.customer_photo_path).toBe('u1/foto-1.jpg');
  });

  it('un rechazo definitivo de Storage (403) también se omite; un error de red se reintenta', async () => {
    await enqueue(FOTOS);
    const [cliente, cedula] = outboxPayloads('upload_negocio_signature').filter((row) => row.bucket === 'negocios-fotos');
    (uploadNegocioPhoto as jest.Mock)
      .mockRejectedValueOnce(new NegocioPhotoUploadError('cliente', 'new row violates row-level security policy', { definitive: true }))
      .mockRejectedValueOnce(new NegocioPhotoUploadError('cedula', 'Network request failed'));

    const skipped = await pushUploadNegocioSignature(cliente);
    expect(skipped.outcome).toBe('done');
    expect(skipped.outcome === 'done' && skipped.note).toMatch(/row-level security/);

    await expect(pushUploadNegocioSignature(cedula)).rejects.toThrow(/Network request failed/);
    expect(queuedPayload().negocio.customer_id_photo_path).toBe('u1/foto-2.png');
  });

  it('«Reintentar» un negocio rechazado no se bloquea por una foto perdida (sí por una firma)', async () => {
    await enqueue(FOTOS);
    for (const upload of mockDb.__table('file_uploads')) {
      upload.status = upload.bucket === 'negocios-firmas' ? 'done' : 'failed';
    }
    (localFileExists as jest.Mock).mockResolvedValue(false);
    const item = mockDb.__table('sync_outbox').find((row) => row.type === 'create_negocio')!;

    const blocked = await prepareRetryNegocio(mockDb as never, item as never, new PreparedChanges());

    expect(blocked).toBeNull();
  });

  it('las firmas siguen siendo estrictas: una firma perdida no se omite', async () => {
    await enqueue(FOTOS);
    (localFileExists as jest.Mock).mockResolvedValue(false);
    const firma = outboxPayloads('upload_negocio_signature').find((row) => row.role === 'cliente');

    const result = await pushUploadNegocioSignature(firma);

    expect(result).toEqual({ outcome: 'fail', message: expect.stringMatching(/^Hay que volver a firmar/) });
    expect(queuedPayload().negocio.customer_signature_url).toEqual(expect.any(String));
  });

  it('el rechazo del negocio marca también sus fotos pendientes', async () => {
    await enqueue(FOTOS);
    const changes = new PreparedChanges();

    await prepareRejectedNegocio(mockDb as never, queuedPayload(), 'Stock insuficiente', changes);
    changes.build();

    expect(mockDb.__table('file_uploads').map((row) => row.status)).toEqual(['failed', 'failed', 'failed', 'failed']);
  });
});
