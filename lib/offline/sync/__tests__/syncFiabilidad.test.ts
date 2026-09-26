import { supabase } from '@/lib/supabase';
import { useSyncStore } from '../../store/syncStore';
import { localFileExists, deleteLocalPagoSupportFile } from '../../security/localFiles';
import {
  blockedCustomerReason,
  enqueueNegocioCreateOffline,
  prepareConfirmNegocio,
  prepareRejectDependentNegocios,
  prepareRejectedNegocio,
  pushCreateNegocio,
  pushUploadNegocioSignature,
} from '../negocioCreateCommand';
import { countOutbox, listReviewableOutbox } from '../outbox';
import { pushOutboxItem } from '../pushCommands';
import {
  discardOutboxEntry,
  dismissOutboxNoticeEntry,
  listCustomerDependents,
  retryOutboxEntry,
} from '../queueActions';
import { PreparedChanges } from '../reconcile';
import { classifyPushError, classifyPushFailure, isTransportError } from '../retryPolicy';
import { EXHAUSTED_RETRIES_PREFIX, syncErrorText } from '../syncErrorText';
import type { CreateCustomerPayload, CreateNegocioPayload } from '../types';

/**
 * Fiabilidad de la cola sin señal: ventas huérfanas de un cliente rechazado,
 * errores definitivos que se reintentaban medio día, falsos «sin señal»,
 * firmas al reintentar, mensajes crudos y el aviso de otro dueño.
 */

type FakeRecord = Record<string, any>;

const mockDb = createFakeDatabase();

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

jest.mock('../../database', () => ({
  getDatabase: () => mockDb,
  isDatabaseOpen: () => true,
}));

jest.mock('@/lib/uploadSignature', () => {
  const actual = jest.requireActual('@/lib/uploadSignature');
  return { ...actual, uploadNegocioSignature: jest.fn(async () => 'ruta/subida.png') };
});

jest.mock('@/lib/uploadPagoSupport', () => ({ uploadAndAttachPagoSupport: jest.fn() }));

jest.mock('../../security/localFiles', () => ({
  persistNegocioSignatureFile: jest.fn(async (_source: string, localId: string, role: string) =>
    `file:///firmas/${localId}-${role}.png`
  ),
  deleteLocalPagoSupportFile: jest.fn(async () => undefined),
  localFileExists: jest.fn(async () => true),
}));

function createFakeDatabase() {
  const rows: FakeRecord[] = [];
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
    batch: async () => undefined,
    __table: (table: string) => rows.filter((row) => row.__table === table),
    __reset: () => {
      rows.length = 0;
      seq = 0;
    },
  };
}

const db = mockDb as never;
let clock = 1_000;

function addOutbox(type: string, payload: Record<string, unknown>, status = 'pending', lastError: string | null = null) {
  return mockDb.get('sync_outbox').prepareCreate((record) => {
    record.type = type;
    record.payloadJson = JSON.stringify(payload);
    record.idempotencyKey = `idem-${type}-${clock}`;
    record.status = status;
    record.attempts = 0;
    record.lastError = lastError;
    record.nextRetryAt = 0;
    record.queuedAt = ++clock;
    record.resultJson = null;
  });
}

const CUSTOMER: CreateCustomerPayload = {
  lane: 'customer:c-local',
  customerId: 'c-local',
  name: 'Ana Pérez',
  idNumber: '123',
  phone: null,
};

async function enqueueNegocio(customerId = 'c-local', lane = 'customer:c-local') {
  await enqueueNegocioCreateOffline({
    negocioId: 'neg-1',
    idempotencyKey: 'idem-neg-1',
    negocio: { customer_id: customerId, codeudor_customer_id: null, seller_id: 'u1', total_credit: 900000 },
    items: [{ product_id: 'p1', quantity: 1 }],
    signatures: [
      { role: 'cliente', value: 'data:image/png;base64,AAAA' },
      { role: 'vendedor', value: 'data:image/png;base64,BBBB' },
    ],
    lane,
    local: {
      dealDate: '2026-09-25',
      totalCredit: 900000,
      customerId,
      customerName: 'Ana Pérez',
      codeudorCustomerId: null,
      direccion: 'Vereda',
      municipioId: 'm1',
      municipioName: 'Andes',
      sellerId: 'u1',
      sellerName: 'Vendedor Uno',
      createdBy: 'u1',
    },
  });
}

const outboxOf = (type: string) => mockDb.__table('sync_outbox').filter((row) => row.type === type);
const negocioItem = () => outboxOf('create_negocio')[0];
const negocioPayload = () => JSON.parse(negocioItem().payloadJson) as CreateNegocioPayload;

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.__reset();
  useSyncStore.setState({ userId: 'u1', online: true });
  (localFileExists as jest.Mock).mockResolvedValue(true);
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'neg-1', error: null });
  (supabase.from as jest.Mock).mockReturnValue(selectReturning(null));
});

function selectReturning(row: Record<string, unknown> | null) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return chain;
}

describe('1. venta huérfana: cliente creado sin señal que no llegó', () => {
  it('el negocio que usa un cliente rechazado se rechaza en el acto, con motivo claro', async () => {
    addOutbox('create_customer', CUSTOMER, 'failed', 'Sin permiso para crear clientes');
    await enqueueNegocio();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';

    const result = await pushCreateNegocio(negocioPayload(), 'idem-neg-1');

    expect(result.outcome).toBe('fail');
    expect(result.outcome === 'fail' && result.message).toBe(
      'El cliente Ana Pérez no se pudo crear: Sin permiso para crear clientes. El negocio no puede enviarse sin él.'
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('también si el cliente se descartó o quedó en conflicto', async () => {
    addOutbox('create_customer', CUSTOMER, 'discarded', 'Descartado por el usuario');
    expect(await blockedCustomerReason(db, ['c-local'])).toMatch(
      /^El cliente Ana Pérez no se pudo crear: se descartó de la cola/
    );
    mockDb.__reset();
    addOutbox('create_customer', CUSTOMER, 'conflict', 'duplicate key value violates unique constraint "customers_id_number_key"');
    expect(await blockedCustomerReason(db, ['c-local'])).toMatch(/Ya existe un cliente con ese número de documento/);
  });

  it('un cliente confirmado o todavía en cola no bloquea', async () => {
    addOutbox('create_customer', CUSTOMER, 'done');
    expect(await blockedCustomerReason(db, ['c-local'])).toBeNull();
    mockDb.__reset();
    addOutbox('create_customer', CUSTOMER, 'pending');
    await enqueueNegocio();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    const result = await pushCreateNegocio(negocioPayload(), 'idem-neg-1');
    expect(result.outcome).toBe('retry');
  });

  it('al rechazarse el cliente, sus negocios en cola quedan rechazados de inmediato', async () => {
    addOutbox('create_customer', CUSTOMER, 'syncing');
    await enqueueNegocio();
    const changes = new PreparedChanges();

    const count = await prepareRejectDependentNegocios(db, CUSTOMER, 'failed', 'Sin permiso para crear clientes', changes);
    changes.build();

    expect(count).toBe(1);
    expect(negocioItem().status).toBe('failed');
    expect(negocioItem().lastError).toMatch(/^El cliente Ana Pérez no se pudo crear: Sin permiso/);
    const [negocio] = mockDb.__table('negocios');
    expect(negocio.rowSyncStatus).toBe('rejected');
    expect(negocio.rejectedReason).toMatch(/El cliente Ana Pérez no se pudo crear/);
    // Las firmas no se envían solas para un negocio que no va a existir…
    expect(outboxOf('upload_negocio_signature').map((row) => row.status)).toEqual(['failed', 'failed']);
    // …pero sus archivos se conservan para poder reintentar.
    expect(deleteLocalPagoSupportFile).not.toHaveBeenCalled();
  });

  it('descartar el cliente avisa de sus negocios y los descarta juntos', async () => {
    const customer = addOutbox('create_customer', CUSTOMER, 'failed', 'Sin permiso');
    await enqueueNegocio();

    const dependents = await listCustomerDependents(db, customer.id);
    expect(dependents).toEqual([
      expect.objectContaining({ negocioId: 'neg-1', customerName: 'Ana Pérez', totalCredit: 900000 }),
    ]);

    const { discarded } = await discardOutboxEntry(db, customer.id);

    expect(discarded).toBe(2);
    expect(customer.status).toBe('discarded');
    expect(negocioItem().status).toBe('discarded');
    expect(negocioItem().lastError).toBe('Descartado junto con el cliente Ana Pérez');
    // Las firmas se cierran y sus archivos se borran solo al descartar.
    expect(outboxOf('upload_negocio_signature').map((row) => row.status)).toEqual(['discarded', 'discarded']);
    expect(deleteLocalPagoSupportFile).toHaveBeenCalledTimes(2);
    // El negocio sigue en el teléfono, marcado.
    expect(mockDb.__table('negocios')[0].rowSyncStatus).toBe('rejected');
  });

  it('otro comando no tiene dependientes', async () => {
    const pago = addOutbox('register_pago', { negocioId: 'n1', pagoLocalId: 'p1', amount: 1 });
    expect(await listCustomerDependents(db, pago.id)).toEqual([]);
  });
});

describe('2. errores definitivos no se reintentan medio día', () => {
  it.each([
    // Vendedor = dueño del cliente (20261207120000, 20261214120000).
    'El cliente Ana Pérez ya tiene vendedor: Carlos. No se puede asignar a otro desde el negocio; para cambiarlo, reasigne el cliente en Clientes.',
    'El cliente Ana Pérez ya pertenece al vendedor Carlos. El vendedor del negocio es siempre el dueño del cliente; para cambiarlo, reasigne el cliente en Clientes.',
    'Este cliente no tiene vendedor: elija el vendedor al que quedará asignado',
    'Seleccione el vendedor al que quedará asignado el cliente',
    'El vendedor no se cambia desde el negocio: asigne un vendedor al cliente en Clientes.',
    'Solo un administrador puede asignar el vendedor del cliente al crear un negocio',
    'Seleccione el cliente del negocio',
    'El cliente del negocio no existe',
    // create_negocio y el plan de cuotas.
    'El negocio debe tener productos',
    'Los ítems del negocio son inválidos',
    'Seleccione un municipio activo',
    'La dirección del negocio es obligatoria',
    'La vereda seleccionada no pertenece al municipio o está inactiva',
    'El número de cuotas es inválido',
    'Indique el número de cuotas para el saldo a financiar',
    'Debe indicar fecha de primera cuota',
    'La fecha de la primera cuota no puede ser anterior a la fecha del negocio',
    'Los abonos iniciales cubren el valor de los productos: el negocio no lleva cuotas',
    'No existe una configuración de crédito activa',
    'Los ítems del negocio contienen valores inconsistentes',
    'La fórmula de crédito no coincide con la configuración vigente',
    'La cuota inicial (100) no coincide con la suma de los abonos iniciales (90)',
    'Los valores financieros no coinciden con los productos y la configuración vigente',
    'Los abonos iniciales tienen un monto o una fecha inválidos',
    'Cada abono inicial debe ser mayor a 0',
    'Indique la fecha de pago de cada abono inicial',
    'No puede haber dos abonos iniciales con la misma fecha; súmelos en uno solo',
    'Los abonos iniciales no pueden superar el valor de los productos',
    'La cuota inicial no puede ser negativa',
    'La cantidad de "Nevera" debe ser un número entero de unidades (se recibió 1.5).',
    'El tipo de orden de entrega no es válido como origen del negocio',
    'Sin permiso para crear negocios',
    'La clave de idempotencia es obligatoria',
    // create_customer_offline.
    'Sin permiso para crear clientes',
    'Identificador e idempotencia son obligatorios',
    'Nombre y documento son obligatorios',
    'El correo electrónico no tiene un formato válido',
    'El municipio seleccionado no está disponible',
    'La vereda seleccionada no pertenece al municipio o no está disponible',
    // register_negocio_pago.
    'El monto debe ser mayor a 0',
    'El monto supera el saldo pendiente de las cuotas (sobra 1000)',
    'El método de pago seleccionado no está disponible',
    'Sitio de pago inválido',
    'Sin permiso para registrar pagos en este negocio',
    'Solo se pueden registrar pagos en negocios activos o entregados',
    'No autenticado',
  ])('%s → fail', (message) => {
    expect(classifyPushError(message)).toBe('fail');
    expect(classifyPushFailure({ message, code: 'P0001' })).toBe('fail');
  });

  it('lo transitorio sigue reintentándose', () => {
    expect(classifyPushError('deadlock detected')).toBe('retry');
    expect(classifyPushError('El cierre está en proceso, intenta de nuevo en unos segundos')).toBe('retry');
    expect(classifyPushFailure({ message: 'JWT expired', code: 'PGRST301' })).toBe('retry');
  });
});

describe('3. solo la falta de red real congela la cola', () => {
  it('un mensaje del servidor con «fetch», «offline» o «abort» no es falta de señal', () => {
    const missingFunction = {
      message:
        'Could not find the function public.create_customer_offline(p_address, p_customer_id, p_email, p_fetch) in the schema cache',
      code: 'PGRST202',
      details: 'Searched for the function …',
    };
    expect(isTransportError(missingFunction)).toBe(false);
    expect(classifyPushFailure(missingFunction)).toBe('retry');
    expect(classifyPushFailure({ message: 'El vendedor está offline', code: 'P0001' })).toBe('retry');
    expect(classifyPushError('No se pudo hacer fetch del cliente')).toBe('retry');
    expect(classifyPushError('La transacción se abortó por un conflicto')).toBe('retry');
    expect(classifyPushFailure({ message: 'Network request failed', status: 500 })).toBe('retry');
  });

  it('los errores de transporte sí son falta de red', () => {
    // postgrest-js convierte el fallo de fetch en `{ message: 'TypeError: …', code: '' }`.
    expect(classifyPushFailure({ message: 'TypeError: Network request failed', code: '' })).toBe('network');
    expect(classifyPushFailure({ message: 'AbortError: Aborted', code: '' })).toBe('network');
    expect(classifyPushFailure({ message: 'Error: La red no respondió a tiempo.', code: '' })).toBe('network');
    expect(classifyPushFailure(new TypeError('Network request failed'))).toBe('network');
    expect(classifyPushFailure(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))).toBe(
      'network'
    );
    expect(classifyPushFailure({ message: 'read ECONNRESET', code: 'ECONNRESET' })).toBe('network');
    expect(classifyPushFailure({ message: 'write EPIPE broken pipe', code: 'EPIPE' })).toBe('retry');
  });

  it('pushOutboxItem: la función que falta en el servidor no se toma como red caída', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.create_customer_offline(...)', code: 'PGRST202' },
    });
    const item = addOutbox('create_customer', CUSTOMER);

    expect((await pushOutboxItem(item as never)).outcome).toBe('retry');

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Network request failed', code: '' },
    });
    expect((await pushOutboxItem(item as never)).outcome).toBe('network');
  });

  it('pushOutboxItem: una regla de vendedor del servidor se rechaza, no se reintenta', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Este cliente no tiene vendedor: elija el vendedor al que quedará asignado', code: 'P0001' },
    });
    addOutbox('create_customer', CUSTOMER, 'done');
    await enqueueNegocio();
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';

    const result = await pushOutboxItem(negocioItem() as never);

    expect(result.outcome).toBe('fail');
  });
});

describe('4. reintentar un negocio rechazado reintenta sus firmas', () => {
  it('el rechazo no borra los archivos de firma', async () => {
    await enqueueNegocio('c1', 'negocio:neg-1');
    const changes = new PreparedChanges();

    await prepareRejectedNegocio(db, negocioPayload(), 'Stock insuficiente', changes);
    changes.build();

    expect(mockDb.__table('file_uploads').map((row) => row.status)).toEqual(['failed', 'failed']);
    expect(deleteLocalPagoSupportFile).not.toHaveBeenCalled();
  });

  it('«Reintentar» vuelve a encolar el negocio, sus firmas y la fila local', async () => {
    await enqueueNegocio('c1', 'negocio:neg-1');
    const changes = new PreparedChanges();
    await prepareRejectedNegocio(db, negocioPayload(), 'Stock insuficiente', changes);
    changes.build();
    negocioItem().status = 'failed';
    negocioItem().attempts = 3;

    const outcome = await retryOutboxEntry(db, negocioItem().id, 5_000);

    expect(outcome).toEqual({ retried: true });
    expect(negocioItem()).toMatchObject({ status: 'pending', attempts: 0, lastError: null, nextRetryAt: 5_000 });
    expect(outboxOf('upload_negocio_signature').map((row) => row.status)).toEqual(['pending', 'pending']);
    expect(mockDb.__table('file_uploads').map((row) => row.status)).toEqual(['pending', 'pending']);
    expect(mockDb.__table('negocios')[0]).toMatchObject({ rowSyncStatus: 'pending', rejectedReason: null });
  });

  it('si el archivo de firma ya no está, lo dice en vez de esperar medio día', async () => {
    await enqueueNegocio('c1', 'negocio:neg-1');
    const changes = new PreparedChanges();
    await prepareRejectedNegocio(db, negocioPayload(), 'Stock insuficiente', changes);
    changes.build();
    negocioItem().status = 'failed';
    (localFileExists as jest.Mock).mockResolvedValue(false);

    const outcome = await retryOutboxEntry(db, negocioItem().id);

    expect(outcome.retried).toBe(false);
    expect(!outcome.retried && outcome.reason).toMatch(/^Hay que volver a firmar: la firma del cliente/);
    expect(negocioItem().status).toBe('failed');
    expect(negocioItem().lastError).toMatch(/Hay que volver a firmar/);
  });

  it('subir una firma cuyo archivo desapareció falla con motivo (no «sin señal»)', async () => {
    await enqueueNegocio('c1', 'negocio:neg-1');
    (localFileExists as jest.Mock).mockResolvedValue(false);
    const firma = JSON.parse(outboxOf('upload_negocio_signature')[0].payloadJson);

    const result = await pushUploadNegocioSignature(firma);

    expect(result).toEqual({ outcome: 'fail', message: expect.stringMatching(/^Hay que volver a firmar/) });
  });

  it('un negocio con una firma fallida se rechaza de inmediato, diciendo cuál', async () => {
    await enqueueNegocio('c1', 'negocio:neg-1');
    const [cliente, vendedor] = mockDb.__table('file_uploads');
    cliente.status = 'failed';
    cliente.lastError = 'Firma descartada';
    vendedor.status = 'done';

    const result = await pushCreateNegocio(negocioPayload(), 'idem-neg-1');

    expect(result).toEqual({ outcome: 'fail', message: 'La firma del cliente no se pudo subir: Firma descartada' });
  });

  it('reintentar un pago sigue siendo un simple reinicio', async () => {
    const pago = addOutbox('register_pago', { negocioId: 'n1', pagoLocalId: 'p1', amount: 1 }, 'failed', 'x');
    expect(await retryOutboxEntry(db, pago.id, 9)).toEqual({ retried: true });
    expect(pago).toMatchObject({ status: 'pending', attempts: 0, lastError: null, nextRetryAt: 9 });
  });
});

describe('5. mensajes de la cola en español claro', () => {
  it.each([
    ['duplicate key value violates unique constraint "foo_key"', 'Ya existe un registro con esos datos.'],
    [
      'duplicate key value violates unique constraint "customers_id_number_key"',
      'Ya existe un cliente con ese número de documento.',
    ],
    ['JWT expired', 'La sesión expiró. Vuelva a iniciar sesión para enviar los cambios.'],
    ['TypeError: Network request failed', 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.'],
    [
      'Could not find the function public.create_customer_offline(p_email) in the schema cache',
      'El servidor todavía no tiene esta función. Actualice la app o avise al administrador; la cola lo volverá a intentar.',
    ],
    ['El cliente del negocio no existe', 'El cliente del negocio no existe'],
  ])('%s', (raw, expected) => {
    expect(syncErrorText(raw)).toBe(expected);
  });

  it('conserva el aviso de intentos agotados', () => {
    expect(syncErrorText(`${EXHAUSTED_RETRIES_PREFIX}deadlock detected`)).toBe(
      `${EXHAUSTED_RETRIES_PREFIX}El servidor estaba ocupado con otro cambio; se volverá a intentar.`
    );
    expect(syncErrorText(null)).toBeNull();
  });
});

describe('8. aviso cuando la venta sin señal quedó a nombre de otro dueño', () => {
  it('registra la nota y corrige el vendedor local', async () => {
    await enqueueNegocio('c1', 'negocio:neg-1');
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    mockDb.get('profiles').prepareCreate((row) => {
      row._raw.id = 'u2';
      row.fullName = 'Carlos Dueño';
    });
    (supabase.from as jest.Mock).mockReturnValue(selectReturning({ numero: 20260010, status: 'por_firmar', seller_id: 'u2' }));

    const result = await pushCreateNegocio(negocioPayload(), 'idem-neg-1');

    expect(result).toMatchObject({
      outcome: 'done',
      note: 'El cliente Ana Pérez ya era de Carlos Dueño: el negocio quedó a su nombre.',
      result: { numero: 20260010, sellerId: 'u2', sellerName: 'Carlos Dueño' },
    });
    const changes = new PreparedChanges();
    await prepareConfirmNegocio(db, negocioPayload(), changes, (result as any).result);
    changes.build();
    expect(mockDb.__table('negocios')[0]).toMatchObject({ sellerId: 'u2', sellerName: 'Carlos Dueño', numero: 20260010 });
  });

  it('sin cambio de dueño no hay nota', async () => {
    await enqueueNegocio('c1', 'negocio:neg-1');
    for (const upload of mockDb.__table('file_uploads')) upload.status = 'done';
    (supabase.from as jest.Mock).mockReturnValue(selectReturning({ numero: 20260010, status: 'por_firmar', seller_id: 'u1' }));

    const result = await pushCreateNegocio(negocioPayload(), 'idem-neg-1');

    expect(result).not.toHaveProperty('note');
  });

  it('los enviados con aviso se ven en la cola hasta darlos por vistos', async () => {
    const now = 10_000;
    addOutbox('create_negocio', { negocioId: 'n9' }, 'done', 'El cliente Ana ya era de Carlos: el negocio quedó a su nombre.');
    addOutbox('register_pago', { negocioId: 'n9' }, 'done', null);

    const reviewable = await listReviewableOutbox(db, now);
    expect(reviewable.map((row: any) => row.status)).toEqual(['done']);
    expect((await countOutbox(db, now)).notices).toBe(1);

    await dismissOutboxNoticeEntry(db, reviewable[0].id);
    expect((await countOutbox(db, now)).notices).toBe(0);
  });
});
