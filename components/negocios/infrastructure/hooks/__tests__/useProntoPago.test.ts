import { act, renderHook, waitFor } from '@testing-library/react-native';
import { hasUnsettledSyncForNegocio } from '@/lib/offline/repositories/offlineRepository';
import { PRONTO_PAGO_OFFLINE_MESSAGE, PRONTO_PAGO_PENDING_SYNC_MESSAGE } from '@/lib/negocios/prontoPago';
import { fetchPaymentMethods } from '../../services/paymentMethodsService';
import { fetchProntoPagoCuotas, registerProntoPago } from '../../services/negocioPagosService';
import { PRONTO_PAGO_NETWORK_RETRY_MESSAGE, useProntoPago } from '../useProntoPago';

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  hasUnsettledSyncForNegocio: jest.fn(async () => false),
}));
jest.mock('../../services/paymentMethodsService', () => ({
  fetchPaymentMethods: jest.fn(async () => [{ id: 'pm-1', name: 'Efectivo' }]),
}));
jest.mock('../../services/negocioPagosService', () => ({
  fetchProntoPagoCuotas: jest.fn(),
  registerProntoPago: jest.fn(),
}));

const mockedPending = hasUnsettledSyncForNegocio as jest.MockedFunction<typeof hasUnsettledSyncForNegocio>;
const mockedCuotas = fetchProntoPagoCuotas as jest.MockedFunction<typeof fetchProntoPagoCuotas>;
const mockedRegister = registerProntoPago as jest.MockedFunction<typeof registerProntoPago>;

const cuota = (amount: number) => ({
  id: 'c1',
  installment_number: 1,
  due_date: '2026-10-01',
  amount,
  paid_amount: 0,
  late_fee_amount: 0,
  status: 'pendiente',
  deleted_at: null,
});

const values = {
  pendingTotal: 1_000_000,
  discountAmount: 100_000,
  discountReason: 'Paga todo',
  paymentMethodId: 'pm-1',
  receiptNumber: null,
  netAmount: 900_000,
};

type HookProps = Parameters<typeof useProntoPago>[0];

function setup(overrides: Partial<HookProps> = {}) {
  const onRegistered = jest.fn();
  const props: HookProps = { negocioId: 'neg-1', online: true, fromLocal: false, onRegistered, ...overrides };
  const hook = renderHook((current: HookProps) => useProntoPago(current), { initialProps: props });
  return { ...hook, onRegistered };
}

async function openSheet(result: { current: ReturnType<typeof useProntoPago> }) {
  act(() => result.current.open());
  await waitFor(() => expect(result.current.summary).not.toBeNull());
  await waitFor(() => expect(result.current.paymentMethodsLoading).toBe(false));
}

const networkError = () => new TypeError('Network request failed');

beforeEach(() => {
  jest.clearAllMocks();
  mockedPending.mockResolvedValue(false);
  mockedCuotas.mockResolvedValue([cuota(1_000_000)]);
  (fetchPaymentMethods as jest.Mock).mockResolvedValue([{ id: 'pm-1', name: 'Efectivo' }]);
});

describe('useProntoPago', () => {
  it('al abrir recarga las cuotas del servidor y calcula el pendiente', async () => {
    const { result } = setup();
    await openSheet(result);

    expect(mockedCuotas).toHaveBeenCalledWith('neg-1');
    expect(result.current.summary?.pendingTotal).toBe(1_000_000);
    expect(result.current.visible).toBe(true);
    expect(result.current.paymentMethods).toHaveLength(1);
  });

  it('registra con el RPC del negocio y avisa a la pantalla', async () => {
    mockedRegister.mockResolvedValueOnce('pago-1');
    const { result, onRegistered } = setup();
    await openSheet(result);

    await act(async () => result.current.submit(values));

    const call = mockedRegister.mock.calls[0][0];
    expect(call.name).toBe('register_negocio_pronto_pago');
    expect(call.args).toMatchObject({
      p_negocio_id: 'neg-1',
      p_expected_total: 1_000_000,
      p_discount_amount: 100_000,
      p_discount_reason: 'Paga todo',
      p_payment_method_id: 'pm-1',
      p_payment_site: 'app_movil',
    });
    expect(onRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ pagoId: 'pago-1', values, paymentMethodName: 'Efectivo' })
    );
    expect(result.current.visible).toBe(false);
  });

  it('desde una parada usa el RPC de la ruta y revisa la cola de esa parada', async () => {
    mockedRegister.mockResolvedValueOnce('pago-1');
    const { result } = setup({ routeStopId: 'stop-1' });
    await openSheet(result);

    await act(async () => result.current.submit(values));

    expect(mockedRegister.mock.calls[0][0]).toMatchObject({
      name: 'register_collection_route_pronto_pago',
      args: expect.objectContaining({ p_stop_id: 'stop-1' }),
    });
    expect(mockedPending).toHaveBeenCalledWith({ negocioId: 'neg-1', routeStopId: 'stop-1' });
  });

  it('tras un fallo de red reintenta con la misma clave y la misma fecha', async () => {
    mockedRegister.mockRejectedValueOnce(networkError()).mockResolvedValueOnce('pago-1');
    const { result, onRegistered } = setup();
    await openSheet(result);

    await act(async () => result.current.submit(values));
    expect(result.current.notice).toEqual({ tone: 'error', text: PRONTO_PAGO_NETWORK_RETRY_MESSAGE });
    expect(result.current.visible).toBe(true);
    expect(onRegistered).not.toHaveBeenCalled();

    await act(async () => result.current.submit(values));

    const [first, second] = mockedRegister.mock.calls.map(([call]) => call.args);
    expect(second.p_idempotency_key).toBe(first.p_idempotency_key);
    expect(second.p_paid_at).toBe(first.p_paid_at);
    expect(onRegistered).toHaveBeenCalledTimes(1);
  });

  it('si «el saldo cambió» recarga las cuotas y la siguiente confirmación usa clave nueva', async () => {
    mockedRegister
      .mockRejectedValueOnce({
        code: 'P0001',
        message: 'El saldo del negocio cambió (esperado $ 1.000.000, actual $ 1.005.000). Recargue e intente de nuevo',
      })
      .mockResolvedValueOnce('pago-1');
    const { result } = setup();
    await openSheet(result);

    mockedCuotas.mockResolvedValueOnce([cuota(1_005_000)]);
    await act(async () => result.current.submit(values));

    expect(result.current.notice?.tone).toBe('warning');
    expect(result.current.notice?.text).toMatch(/^El saldo del negocio cambió/);
    expect(result.current.summary?.pendingTotal).toBe(1_005_000);

    // Aunque se confirme exactamente lo mismo, la clave es nueva.
    await act(async () => result.current.submit(values));
    const [first, second] = mockedRegister.mock.calls.map(([call]) => call.args);
    expect(second.p_idempotency_key).not.toBe(first.p_idempotency_key);
  });

  it('muestra el error del servidor (42501) y no reutiliza la clave', async () => {
    mockedRegister
      .mockRejectedValueOnce({ code: '42501', message: 'Sin permiso para registrar descuentos por pronto pago en este negocio' })
      .mockResolvedValueOnce('pago-1');
    const { result } = setup();
    await openSheet(result);

    await act(async () => result.current.submit(values));
    expect(result.current.notice).toEqual({
      tone: 'error',
      text: 'Sin permiso para registrar descuentos por pronto pago en este negocio',
    });

    await act(async () => result.current.submit(values));
    const [first, second] = mockedRegister.mock.calls.map(([call]) => call.args);
    expect(second.p_idempotency_key).not.toBe(first.p_idempotency_key);
  });

  it('sin conexión o con detalle local queda bloqueado y no envía nada', async () => {
    const offline = setup({ online: false });
    expect(offline.result.current.blockReason).toBe(PRONTO_PAGO_OFFLINE_MESSAGE);
    await act(async () => offline.result.current.submit(values));
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(offline.result.current.notice?.text).toBe(PRONTO_PAGO_OFFLINE_MESSAGE);

    const local = setup({ fromLocal: true });
    expect(local.result.current.blockReason).toBe(PRONTO_PAGO_OFFLINE_MESSAGE);
  });

  it('con cobros del negocio pendientes en la cola queda bloqueado', async () => {
    mockedPending.mockResolvedValue(true);
    const { result } = setup();

    await waitFor(() => expect(result.current.blockReason).toBe(PRONTO_PAGO_PENDING_SYNC_MESSAGE));
    await act(async () => result.current.submit(values));

    expect(mockedRegister).not.toHaveBeenCalled();
    expect(result.current.notice?.text).toBe(PRONTO_PAGO_PENDING_SYNC_MESSAGE);
  });
});
