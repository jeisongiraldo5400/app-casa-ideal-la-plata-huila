import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { canUseLocalDb } from '@/lib/offline/repositories/offlineRepository';
import { enqueueNegocioCreateOffline } from '@/lib/offline/sync/negocioCreateCommand';
import { NegocioPhotoUploadError, removeNegocioPhotos, uploadNegocioPhoto } from '@/lib/negocioPhotos';
import { useNegociosStore, type CreateNegocioInput } from '../negociosStore';
import { validateNegocioItemsStock } from '../../services/negociosStockService';

/**
 * Fotos opcionales del cliente al crear el negocio: con red se suben antes del
 * RPC y sus rutas viajan en `p_negocio`; si una falla, el negocio no se crea y
 * el reintento no repite lo ya subido. Sin red, viajan a la cola con su ruta.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: jest.fn(() => false),
  fetchNegociosListFromLocal: jest.fn(),
}));

jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  fetchCreditSettingsFromLocal: jest.fn(),
}));

jest.mock('@/lib/offline/sync/negocioCreateCommand', () => ({
  enqueueNegocioCreateOffline: jest.fn(async () => ({ negocioId: 'draft', queuedSignatures: 0 })),
  negocioLaneFor: jest.fn(async (id: string) => `negocio:${id}`),
}));

jest.mock('@/components/notifications/infrastructure/services/dispatchNotifications', () => ({
  kickNotificationDispatch: jest.fn(),
}));

jest.mock('@/lib/uploadSignature', () => ({
  isNewLocalSignature: jest.fn(() => false),
  removeNegocioSignatures: jest.fn().mockResolvedValue(undefined),
  uploadNegocioSignature: jest.fn().mockResolvedValue('u1/n/vendedor.png'),
}));

jest.mock('@/lib/negocioPhotos', () => {
  const actual = jest.requireActual('@/lib/negocioPhotos');
  return {
    ...actual,
    uploadNegocioPhoto: jest.fn(async (_uri: string, opts: { path: string }) => opts.path),
    removeNegocioPhotos: jest.fn(async () => undefined),
  };
});

jest.mock('../../services/negociosStockService', () => {
  const actual = jest.requireActual('../../services/negociosStockService');
  return {
    ...actual,
    validateNegocioItemsStock: jest.fn(),
    validateNegocioItemsStockLocal: jest.fn(async () => ({ ok: true })),
  };
});

const CREDIT_SETTINGS_ROW = {
  formula_type: 'financed_balance',
  interest_rate_monthly_pct: 0,
  rounding_unit: 1000,
  late_fee_rate_pct: 0,
  money_decimal_places: 0,
  min_installments: 1,
  max_installments: 36,
  default_frequency: 'mensual',
  legal_text: null,
};

function mockFrom() {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {};
    ['select', 'is', 'eq', 'order', 'limit'].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    const result =
      table === 'credit_settings'
        ? { data: CREDIT_SETTINGS_ROW, error: null }
        : table === 'negocios'
        ? { data: { id: 'n1', numero: 20260007 }, error: null }
        : { data: [], error: null };
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.single = jest.fn(() => Promise.resolve(result));
    return builder;
  });
}

const FOTO_CLIENTE = { id: 'foto-1', uri: 'file:///cache/cliente.jpg', mimeType: 'image/jpeg', size: 200_000 };
const FOTO_CEDULA = { id: 'foto-2', uri: 'file:///cache/cedula.jpg', mimeType: 'image/jpeg', size: 150_000 };
const FOTO_CEDULA_ATRAS = { id: 'foto-3', uri: 'file:///cache/cedula-atras.jpg', mimeType: 'image/jpeg', size: 140_000 };

const baseInput: CreateNegocioInput = {
  deal_date: '2026-10-01',
  municipio_id: 'm1',
  direccion: 'Calle 1',
  customer_id: 'c1',
  customer_name: 'Ana Pérez',
  items: [{ product_id: 'p1', warehouse_id: 'w1', quantity: 1, description: 'Nevera', unit_price: 900000 }],
  down_payment_schedule: [],
  installments_count: 3,
  frequency: 'mensual',
  first_due_date: '2026-11-01',
  customer_signature_data_url: '',
  seller_signature_data_url: 'file:///firma-vendedor.png',
  activate: true,
};

const withPhotos: CreateNegocioInput = { ...baseInput, customer_photo: FOTO_CLIENTE, customer_id_photo: FOTO_CEDULA };

function rpcCall(index = 0) {
  return (supabase.rpc as jest.Mock).mock.calls[index]?.[1] as {
    p_idempotency_key: string;
    p_negocio: Record<string, unknown>;
  };
}

describe('negociosStore.createAndActivate · fotos del cliente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom();
    (canUseLocalDb as jest.Mock).mockReturnValue(false);
    useSyncStore.setState({ userId: 'u1', online: true });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'n1', error: null });
    (validateNegocioItemsStock as jest.Mock).mockResolvedValue({ ok: true });
    useNegociosStore.setState({ creditSettings: null });
  });

  it('sin fotos: el negocio sale con la forma de siempre y no se sube nada', async () => {
    await useNegociosStore.getState().createAndActivate(baseInput);

    expect(uploadNegocioPhoto).not.toHaveBeenCalled();
    const { p_negocio } = rpcCall();
    expect(p_negocio).not.toHaveProperty('customer_photo_path');
    expect(p_negocio).not.toHaveProperty('customer_id_photo_path');
  });

  it('con fotos: las sube a la carpeta del usuario ANTES del RPC y envía sus rutas', async () => {
    await useNegociosStore.getState().createAndActivate(withPhotos);

    expect(uploadNegocioPhoto).toHaveBeenCalledWith(FOTO_CLIENTE.uri, {
      path: 'u1/foto-1.jpg',
      mimeType: 'image/jpeg',
      kind: 'cliente',
    });
    expect(uploadNegocioPhoto).toHaveBeenCalledWith(FOTO_CEDULA.uri, {
      path: 'u1/foto-2.jpg',
      mimeType: 'image/jpeg',
      kind: 'cedula',
    });
    const uploadOrder = (uploadNegocioPhoto as jest.Mock).mock.invocationCallOrder[1];
    expect(uploadOrder).toBeLessThan((supabase.rpc as jest.Mock).mock.invocationCallOrder[0]);
    expect(rpcCall().p_negocio).toMatchObject({
      customer_photo_path: 'u1/foto-1.jpg',
      customer_id_photo_path: 'u1/foto-2.jpg',
    });
  });

  it('cédula por el frente y por atrás: sube las dos y envía customer_id_back_photo_path', async () => {
    await useNegociosStore.getState().createAndActivate({ ...withPhotos, customer_id_back_photo: FOTO_CEDULA_ATRAS });

    expect(uploadNegocioPhoto).toHaveBeenCalledWith(FOTO_CEDULA_ATRAS.uri, {
      path: 'u1/foto-3.jpg',
      mimeType: 'image/jpeg',
      kind: 'cedula_atras',
    });
    expect(rpcCall().p_negocio).toMatchObject({
      customer_photo_path: 'u1/foto-1.jpg',
      customer_id_photo_path: 'u1/foto-2.jpg',
      customer_id_back_photo_path: 'u1/foto-3.jpg',
    });
  });

  it('sin señal: la cédula por atrás va a la cola con su ruta', async () => {
    useSyncStore.setState({ userId: 'u1', online: false });
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
    const { fetchCreditSettingsFromLocal } = jest.requireMock('@/lib/offline/repositories/catalogRepository');
    (fetchCreditSettingsFromLocal as jest.Mock).mockResolvedValue(CREDIT_SETTINGS_ROW);

    await useNegociosStore.getState().createAndActivate({ ...baseInput, customer_id_back_photo: FOTO_CEDULA_ATRAS });

    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    expect(payload.photos).toEqual([
      { kind: 'cedula_atras', uri: FOTO_CEDULA_ATRAS.uri, mimeType: 'image/jpeg', storagePath: 'u1/foto-3.jpg', uploaded: false },
    ]);
  });

  it('solo la cédula: envía únicamente su ruta', async () => {
    await useNegociosStore.getState().createAndActivate({ ...baseInput, customer_id_photo: FOTO_CEDULA });

    const { p_negocio } = rpcCall();
    expect(p_negocio.customer_id_photo_path).toBe('u1/foto-2.jpg');
    expect(p_negocio).not.toHaveProperty('customer_photo_path');
  });

  it('si una foto no sube, el negocio no se crea; el reintento usa la misma clave y no repite la subida', async () => {
    (uploadNegocioPhoto as jest.Mock)
      .mockImplementationOnce(async (_uri: string, opts: { path: string }) => opts.path)
      .mockImplementationOnce(async () => {
        throw new NegocioPhotoUploadError('cedula', 'new row violates row-level security policy');
      });

    await expect(useNegociosStore.getState().createAndActivate(withPhotos)).rejects.toThrow(
      /No se pudo subir la foto de la cédula/
    );
    expect(supabase.rpc).not.toHaveBeenCalled();

    await useNegociosStore.getState().createAndActivate(withPhotos);

    const uploadedPaths = (uploadNegocioPhoto as jest.Mock).mock.calls.map((call) => call[1].path);
    // La del cliente subió en el primer intento: solo se reintenta la cédula.
    expect(uploadedPaths).toEqual(['u1/foto-1.jpg', 'u1/foto-2.jpg', 'u1/foto-2.jpg']);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(rpcCall().p_negocio).toMatchObject({ customer_id_photo_path: 'u1/foto-2.jpg' });
  });

  it('un rechazo definitivo del servidor tras subir las fotos las limpia', async () => {
    (uploadNegocioPhoto as jest.Mock).mockRejectedValueOnce(new NegocioPhotoUploadError('cliente', 'Bucket not found'));
    await expect(useNegociosStore.getState().createAndActivate(withPhotos)).rejects.toThrow(/foto del cliente/);
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: { message: 'deadlock detected' } });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const builder: Record<string, unknown> = {};
      ['select', 'is', 'eq', 'order', 'limit'].forEach((method) => {
        builder[method] = jest.fn(() => builder);
      });
      const result = table === 'credit_settings' ? { data: CREDIT_SETTINGS_ROW, error: null } : { data: null, error: null };
      builder.maybeSingle = jest.fn(() => Promise.resolve(result));
      builder.single = builder.maybeSingle;
      return builder;
    });
    // Rechazo definitivo del servidor: se limpian las fotos subidas.
    await expect(useNegociosStore.getState().createAndActivate(withPhotos)).rejects.toThrow(/deadlock/);
    expect(removeNegocioPhotos).toHaveBeenCalledWith(['u1/foto-1.jpg', 'u1/foto-2.jpg']);
  });

  it('sin señal: encola las fotos con su ruta ya decidida y sin subirlas', async () => {
    useSyncStore.setState({ userId: 'u1', online: false });
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
    const { fetchCreditSettingsFromLocal } = jest.requireMock('@/lib/offline/repositories/catalogRepository');
    (fetchCreditSettingsFromLocal as jest.Mock).mockResolvedValue(CREDIT_SETTINGS_ROW);

    const result = await useNegociosStore.getState().createAndActivate(withPhotos);

    expect(result).toMatchObject({ queued: true });
    expect(uploadNegocioPhoto).not.toHaveBeenCalled();
    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    expect(payload.photos).toEqual([
      { kind: 'cliente', uri: FOTO_CLIENTE.uri, mimeType: 'image/jpeg', storagePath: 'u1/foto-1.jpg', uploaded: false },
      { kind: 'cedula', uri: FOTO_CEDULA.uri, mimeType: 'image/jpeg', storagePath: 'u1/foto-2.jpg', uploaded: false },
    ]);
  });

  it('sin fotos y sin señal: la cola no recibe fotos', async () => {
    useSyncStore.setState({ userId: 'u1', online: false });
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
    const { fetchCreditSettingsFromLocal } = jest.requireMock('@/lib/offline/repositories/catalogRepository');
    (fetchCreditSettingsFromLocal as jest.Mock).mockResolvedValue(CREDIT_SETTINGS_ROW);

    await useNegociosStore.getState().createAndActivate(baseInput);

    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    expect(payload.photos).toEqual([]);
  });

  it('la red se cae a mitad de las fotos: encola reutilizando la ya subida', async () => {
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
    (uploadNegocioPhoto as jest.Mock)
      .mockImplementationOnce(async (_uri: string, opts: { path: string }) => opts.path)
      .mockImplementationOnce(async () => {
        throw new NegocioPhotoUploadError('cedula', 'Network request failed');
      });

    const result = await useNegociosStore.getState().createAndActivate(withPhotos);

    expect(result).toMatchObject({ queued: true, activatesOnSync: true });
    expect(supabase.rpc).not.toHaveBeenCalled();
    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    expect(payload.photos.map((photo: { uploaded: boolean }) => photo.uploaded)).toEqual([true, false]);
  });

  it('rechaza una foto que no es imagen permitida antes de llamar al servidor', async () => {
    await expect(
      useNegociosStore.getState().createAndActivate({
        ...baseInput,
        customer_photo: { ...FOTO_CLIENTE, mimeType: 'image/heic' },
      })
    ).rejects.toThrow(/Foto del cliente: Solo se permiten fotos/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('negociosStore.createAndActivate · tope del interés', () => {
  const TOPE = 'El interés no puede ser mayor que el subtotal de los productos';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom();
    (canUseLocalDb as jest.Mock).mockReturnValue(false);
    useSyncStore.setState({ userId: 'u1', online: true });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'n1', error: null });
    (validateNegocioItemsStock as jest.Mock).mockResolvedValue({ ok: true });
    useNegociosStore.setState({ creditSettings: null });
  });

  it('un interés igual al subtotal de los productos se acepta', async () => {
    await useNegociosStore.getState().createAndActivate({ ...baseInput, manual_interest_amount: 900000 });
    expect(rpcCall().p_negocio).toMatchObject({ manual_interest_amount: 900000 });
  });

  it('con señal, un interés mayor que el subtotal no llega al servidor', async () => {
    await expect(
      useNegociosStore.getState().createAndActivate({ ...baseInput, manual_interest_amount: 900001 })
    ).rejects.toThrow(TOPE);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(uploadNegocioPhoto).not.toHaveBeenCalled();
  });

  it('sin señal, un interés mayor que el subtotal no se encola', async () => {
    useSyncStore.setState({ userId: 'u1', online: false });
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
    const { fetchCreditSettingsFromLocal } = jest.requireMock('@/lib/offline/repositories/catalogRepository');
    (fetchCreditSettingsFromLocal as jest.Mock).mockResolvedValue(CREDIT_SETTINGS_ROW);

    await expect(
      useNegociosStore.getState().createAndActivate({ ...baseInput, manual_interest_amount: 1_000_000 })
    ).rejects.toThrow(TOPE);
    expect(enqueueNegocioCreateOffline).not.toHaveBeenCalled();
  });
});
