import { supabase } from '@/lib/supabase';
import { useNegociosStore, type CreateNegocioInput } from '../negociosStore';
import { validateNegocioItemsStock } from '../../services/negociosStockService';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: jest.fn(() => false),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: jest.fn(() => false),
  fetchNegociosListFromLocal: jest.fn(),
}));

jest.mock('@/components/notifications/infrastructure/services/dispatchNotifications', () => ({
  kickNotificationDispatch: jest.fn(),
}));

jest.mock('@/lib/uploadSignature', () => ({
  isNewLocalSignature: jest.fn(() => false),
  removeNegocioSignatures: jest.fn().mockResolvedValue(undefined),
  uploadNegocioSignature: jest.fn().mockResolvedValue('https://cdn/firma.png'),
}));

jest.mock('../../services/negociosStockService', () => {
  const actual = jest.requireActual('../../services/negociosStockService');
  return { ...actual, validateNegocioItemsStock: jest.fn() };
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

/** Builder encadenable: `credit_settings` devuelve la configuración; `negocios` el negocio creado. */
function mockFrom() {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const builder: any = {};
    ['select', 'is', 'eq', 'order', 'limit'].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    const result =
      table === 'credit_settings'
        ? { data: CREDIT_SETTINGS_ROW, error: null }
        : table === 'negocios'
        ? { data: { id: 'n1', numero: 7 }, error: null }
        : { data: [], error: null };
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
    return builder;
  });
}

const baseInput: CreateNegocioInput = {
  deal_date: '2026-09-11',
  municipio_id: 'm1',
  direccion: 'Calle 1',
  customer_id: 'c1',
  items: [
    { product_id: 'p1', warehouse_id: 'w1', quantity: 1, description: 'Base', unit_price: 500000 },
  ],
  down_payment_schedule: [],
  installments_count: 3,
  frequency: 'mensual',
  first_due_date: '2026-10-11',
  customer_signature_data_url: '',
  seller_signature_data_url: 'file:///firma-vendedor.png',
  activate: true,
};

function rpcNegocioPayload(call = 0) {
  const args = (supabase.rpc as jest.Mock).mock.calls[call]?.[1];
  return args?.p_negocio as Record<string, unknown>;
}

describe('negociosStore.createAndActivate — origen y destino', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'u1' } } });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'n1', error: null });
    (validateNegocioItemsStock as jest.Mock).mockResolvedValue({ ok: true });
    useNegociosStore.setState({ creditSettings: null });
  });

  it('bodega + retiro directo: sin origen ni remisión destino', async () => {
    await useNegociosStore.getState().createAndActivate(baseInput);

    expect(supabase.rpc).toHaveBeenCalledWith('create_negocio', expect.objectContaining({ p_activate: true }));
    expect(rpcNegocioPayload()).toMatchObject({
      remission_id: null,
      source_delivery_order_id: null,
      target_remission_id: null,
    });
    expect(validateNegocioItemsStock).toHaveBeenCalled();
  });

  it('bodega + enviar en remisión: envía target_remission_id y sigue validando stock', async () => {
    await useNegociosStore.getState().createAndActivate({
      ...baseInput,
      target_remission_id: 'rem-target',
    });

    expect(rpcNegocioPayload()).toMatchObject({
      remission_id: null,
      source_delivery_order_id: null,
      target_remission_id: 'rem-target',
    });
    expect(validateNegocioItemsStock).toHaveBeenCalled();
  });

  it('origen remisión, grupo propio: remission_id = source = remisión, sin validar stock', async () => {
    await useNegociosStore.getState().createAndActivate({
      ...baseInput,
      remission_id: 'rem-1',
      source_delivery_order_id: 'rem-1',
    });

    expect(rpcNegocioPayload()).toMatchObject({
      remission_id: 'rem-1',
      source_delivery_order_id: 'rem-1',
      target_remission_id: null,
    });
    expect(validateNegocioItemsStock).not.toHaveBeenCalled();
  });

  it('origen remisión, OE hija: source = hija y sin remission_id', async () => {
    await useNegociosStore.getState().createAndActivate({
      ...baseInput,
      remission_id: null,
      source_delivery_order_id: 'oe-hija',
    });

    expect(rpcNegocioPayload()).toMatchObject({
      remission_id: null,
      source_delivery_order_id: 'oe-hija',
      target_remission_id: null,
    });
  });

  it('rechaza enviar en remisión un negocio con origen en otra orden', async () => {
    await expect(
      useNegociosStore.getState().createAndActivate({
        ...baseInput,
        remission_id: 'rem-1',
        source_delivery_order_id: 'rem-1',
        target_remission_id: 'rem-target',
      })
    ).rejects.toThrow(/origen en bodega central/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('el destino forma parte de la huella de idempotencia', async () => {
    const store = useNegociosStore.getState();
    await store.createAndActivate({ ...baseInput, target_remission_id: 'rem-a' });
    await store.createAndActivate({ ...baseInput, target_remission_id: 'rem-b' });

    const [first, second] = (supabase.rpc as jest.Mock).mock.calls.map((call) => call[1]);
    expect(first.p_idempotency_key).not.toBe(second.p_idempotency_key);
    expect(first.p_negocio_id).not.toBe(second.p_negocio_id);
  });
});
