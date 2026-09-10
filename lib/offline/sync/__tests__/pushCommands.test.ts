import { pushOutboxItem } from '../pushCommands';
import type { SyncOutboxItem } from '../../models';

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}));

function outboxItem(type: string, payload: Record<string, unknown>): SyncOutboxItem {
  return {
    id: 'outbox-1',
    type,
    payloadJson: JSON.stringify(payload),
    idempotencyKey: 'idem-1',
    status: 'pending',
    attempts: 0,
  } as unknown as SyncOutboxItem;
}

const basePago = {
  pagoLocalId: 'local-1',
  negocioId: 'neg-1',
  amount: 50000,
  paidAt: '2026-09-08T10:00:00.000Z',
  receiptNumber: null,
  notes: null,
  paymentMethodId: 'pm-1',
  paymentSite: 'app_movil',
};

describe('pushOutboxItem · pagos', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: 'pago-server-1', error: null });
  });

  it('envía el método de pago al registrar un pago de negocio', async () => {
    const result = await pushOutboxItem(outboxItem('register_pago', basePago));

    expect(result.outcome).toBe('done');
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('register_negocio_pago');
    expect(args).toMatchObject({
      p_payment_method_id: 'pm-1',
      p_negocio_id: 'neg-1',
      p_payment_site: 'app_movil',
    });
  });

  it('envía el método de pago también en el cobro de una ruta', async () => {
    const result = await pushOutboxItem(
      outboxItem('register_route_pago', { ...basePago, routeStopId: 'stop-1' })
    );

    expect(result.outcome).toBe('done');
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('register_collection_route_payment');
    expect(args).toMatchObject({
      p_payment_method_id: 'pm-1',
      p_stop_id: 'stop-1',
      p_payment_site: 'app_movil',
    });
  });

  it('manda null cuando el pago se encoló antes del catálogo de métodos', async () => {
    const { paymentMethodId: _omitted, ...legacyPago } = basePago;

    await pushOutboxItem(outboxItem('register_pago', legacyPago));

    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_payment_method_id: null });
  });

  it('etiqueta como app móvil los pagos encolados antes del sitio de pago', async () => {
    const { paymentSite: _omitted, ...legacyPago } = basePago;

    await pushOutboxItem(outboxItem('register_pago', legacyPago));

    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_payment_site: 'app_movil' });
  });

  it('etiqueta como app móvil un cobro de ruta encolado sin sitio', async () => {
    const { paymentSite: _omitted, ...legacyPago } = basePago;

    await pushOutboxItem(outboxItem('register_route_pago', { ...legacyPago, routeStopId: 'stop-1' }));

    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('register_collection_route_payment');
    expect(args).toMatchObject({ p_payment_site: 'app_movil' });
  });
});
