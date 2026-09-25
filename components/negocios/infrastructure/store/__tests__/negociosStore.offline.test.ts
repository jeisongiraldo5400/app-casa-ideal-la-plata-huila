import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { enqueueNegocioCreateOffline } from '@/lib/offline/sync/negocioCreateCommand';
import { fetchCreditSettingsFromLocal } from '@/lib/offline/repositories/catalogRepository';
import { useNegociosStore, type CreateNegocioInput } from '../negociosStore';

/**
 * Sin señal el negocio no se pierde: se guarda en la cola con sus firmas y se
 * envía solo al volver la red. Nunca se activa (activar mueve stock).
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: () => true,
  fetchNegociosListFromLocal: jest.fn(async () => []),
}));

jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  fetchCreditSettingsFromLocal: jest.fn(),
}));

jest.mock('@/lib/offline/sync/negocioCreateCommand', () => ({
  enqueueNegocioCreateOffline: jest.fn(async () => ({ negocioId: 'draft', queuedSignatures: 2 })),
  negocioLaneFor: jest.fn(async () => 'customer:c1'),
}));

jest.mock('@/components/notifications/infrastructure/services/dispatchNotifications', () => ({
  kickNotificationDispatch: jest.fn(),
}));

jest.mock('../../services/negociosStockService', () => {
  const actual = jest.requireActual('../../services/negociosStockService');
  return {
    ...actual,
    validateNegocioItemsStock: jest.fn(),
    validateNegocioItemsStockLocal: jest.fn(async () => ({ ok: true })),
  };
});

const CREDIT_SETTINGS = {
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

const baseInput: CreateNegocioInput = {
  deal_date: '2026-09-23',
  municipio_id: 'm1',
  direccion: 'Vereda La Esperanza',
  customer_id: 'c1',
  customer_name: 'Ana Pérez',
  items: [
    { product_id: 'p1', warehouse_id: 'w1', quantity: 1, description: 'Nevera', unit_price: 1200000 },
  ],
  down_payment_schedule: [],
  installments_count: 3,
  frequency: 'mensual',
  first_due_date: '2026-10-23',
  customer_signature_data_url: 'data:image/png;base64,AAAA',
  seller_signature_data_url: 'data:image/png;base64,BBBB',
  activate: true,
};

/** Toda consulta al servidor falla por falta de red. */
function mockSinRed() {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const builder: any = {};
    ['select', 'is', 'eq', 'order', 'limit'].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    builder.maybeSingle = jest.fn(() => Promise.reject(new Error('Network request failed')));
    builder.single = builder.maybeSingle;
    return builder;
  });
}

describe('negociosStore.createAndActivate · sin señal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSinRed();
    (fetchCreditSettingsFromLocal as jest.Mock).mockResolvedValue(CREDIT_SETTINGS);
    useSyncStore.setState({ userId: 'u1', online: false });
    useNegociosStore.setState({ creditSettings: null });
  });

  it('usa la configuración de crédito de la última descarga', async () => {
    await useNegociosStore.getState().createAndActivate(baseInput);

    expect(fetchCreditSettingsFromLocal).toHaveBeenCalled();
    expect(useNegociosStore.getState().creditSettings).toMatchObject({ rounding_unit: 1000 });
  });

  it('encola el negocio en vez de llamar al servidor, y no lo activa', async () => {
    const result = await useNegociosStore.getState().createAndActivate(baseInput);

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ queued: true, numero: null });
    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    // Aunque se pulsó «Activar negocio», sin red se guarda firmado y sin activar.
    expect(payload.activate).toBe(false);
    expect(payload.negocio).toMatchObject({
      customer_id: 'c1',
      municipio_id: 'm1',
      direccion: 'Vereda La Esperanza',
      seller_id: 'u1',
    });
    expect(payload.items[0]).toMatchObject({ product_id: 'p1', subtotal: 1200000 });
    expect(payload.signatures.map((row: { role: string }) => row.role)).toEqual([
      'cliente',
      'fiador',
      'vendedor',
    ]);
  });

  it('cliente con dueño: no añade la bandera y pinta el negocio pendiente con el dueño', async () => {
    await useNegociosStore.getState().createAndActivate({ ...baseInput, local_seller_id: 's-dueno' });

    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    // Forma de siempre: el servidor sustituye el usuario por el dueño del cliente.
    expect(payload.negocio.seller_id).toBe('u1');
    expect(payload.negocio).not.toHaveProperty('assign_customer_seller');
    expect(payload.local.sellerId).toBe('s-dueno');
    // Marca de la regla nueva: el servidor exige al admin elegir vendedor.
    expect(payload.negocio.seller_rule).toBe(2);
  });

  it('admin que asigna vendedor a un cliente sin dueño: la bandera viaja en p_negocio', async () => {
    await useNegociosStore.getState().createAndActivate({
      ...baseInput,
      seller_id: 's-nuevo',
      assign_customer_seller: true,
      local_seller_id: 's-nuevo',
    });

    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    expect(payload.negocio).toMatchObject({ seller_id: 's-nuevo', assign_customer_seller: true });
    expect(payload.local.sellerId).toBe('s-nuevo');
  });

  it('el negocio viaja en el carril del cliente que aún está en la cola', async () => {
    await useNegociosStore.getState().createAndActivate(baseInput);

    const [payload] = (enqueueNegocioCreateOffline as jest.Mock).mock.calls[0];
    expect(payload.lane).toBe('customer:c1');
  });

  it('sin configuración descargada lo dice en vez de fallar con un error técnico', async () => {
    (fetchCreditSettingsFromLocal as jest.Mock).mockResolvedValue(null);

    await expect(useNegociosStore.getState().createAndActivate(baseInput)).rejects.toThrow(
      /Descargar información/
    );
    expect(enqueueNegocioCreateOffline).not.toHaveBeenCalled();
  });
});
