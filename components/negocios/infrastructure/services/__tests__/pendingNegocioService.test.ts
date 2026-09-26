import { fetchNegocioDetailFromLocal } from '@/lib/offline/repositories/offlineRepository';
import { loadLocalNegocioDetail, loadPendingNegocio } from '../pendingNegocioService';

let mockNegocio: Record<string, unknown> | null = null;
let mockOutbox: Array<Record<string, unknown>> = [];
let mockProducts: Array<Record<string, unknown>> = [];

jest.mock('@/lib/offline/database', () => ({
  getDatabase: () => ({
    get: (table: string) => ({
      find: async () => {
        if (table === 'negocios' && mockNegocio) return mockNegocio;
        throw new Error('not found');
      },
      query: () => ({
        fetch: async () => (table === 'sync_outbox' ? mockOutbox : table === 'catalog_products' ? mockProducts : []),
      }),
    }),
  }),
}));
jest.mock('@/lib/offline/models', () => ({}));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: () => true,
  fetchNegocioDetailFromLocal: jest.fn(),
}));
jest.mock('@/lib/offline/sync/negocioCreateCommand', () => ({
  DEFAULT_REJECTED_NEGOCIO_REASON: 'El servidor no aceptó el negocio',
}));
jest.mock('@/lib/offline/sync/outbox', () => ({
  parseOutboxPayload: (item: { payloadJson: string }) => JSON.parse(item.payloadJson),
}));

const payload = {
  negocioId: 'n1',
  negocio: {
    products_subtotal: 200000,
    installments_count: 1,
    installment_amount: 200000,
    frequency: 'mensual',
    first_due_date: '2026-10-25',
    down_payment_schedule: [],
  },
  items: [{ product_id: 'p1', quantity: 1, unit_price: 200000, subtotal: 200000 }],
};

const outboxItem = (status: string, lastError: string | null = null, queuedAt = 1) => ({
  type: 'create_negocio',
  status,
  lastError,
  queuedAt,
  payloadJson: JSON.stringify(payload),
});

describe('pendingNegocioService', () => {
  beforeEach(() => {
    mockNegocio = { id: 'n1', rowSyncStatus: 'pending', rejectedReason: null };
    mockOutbox = [outboxItem('pending')];
    mockProducts = [{ id: 'p1', name: 'Nevera', sku: 'NEV' }];
    (fetchNegocioDetailFromLocal as jest.Mock).mockResolvedValue({
      negocio: { id: 'n1', numero: 0, status: 'por_firmar', products_subtotal: 0 },
      items: [],
      cuotas: [],
      pagos: [],
      rejectedPagos: [],
      customer: { name: 'Ana' },
      codeudor: null,
      customerSeller: { id: null, name: null },
    });
  });

  it('pendiente: completa productos, plan y subtotal desde el comando encolado', async () => {
    const detail = await loadLocalNegocioDetail('n1');
    expect(detail?.pendingSync).toEqual({ state: 'pending', reason: null });
    expect(detail?.items).toEqual([expect.objectContaining({ product_id: 'p1', product: { name: 'Nevera', sku: 'NEV' } })]);
    expect(detail?.cuotas).toEqual([expect.objectContaining({ installment_number: 1, due_date: '2026-10-25', amount: 200000 })]);
    expect(detail?.negocio).toMatchObject({ numero: 0, products_subtotal: 200000, installments_count: 1 });
  });

  it('rechazado: trae el motivo del servidor', async () => {
    mockNegocio = { id: 'n1', rowSyncStatus: 'rejected', rejectedReason: null };
    mockOutbox = [outboxItem('failed', 'Stock insuficiente para Nevera')];
    await expect(loadPendingNegocio('n1')).resolves.toMatchObject({
      sync: { state: 'rejected', reason: 'Stock insuficiente para Nevera' },
    });
  });

  it('confirmado por el servidor: sin estado de envío y sin tocar lo descargado', async () => {
    mockNegocio = { id: 'n1', rowSyncStatus: 'synced', rejectedReason: null };
    mockOutbox = [outboxItem('done')];
    const detail = await loadLocalNegocioDetail('n1');
    expect(detail?.pendingSync).toBeNull();
    expect(detail?.items).toEqual([]);
  });

  it('no está en el teléfono: null', async () => {
    mockNegocio = null;
    (fetchNegocioDetailFromLocal as jest.Mock).mockResolvedValue(null);
    await expect(loadLocalNegocioDetail('n1')).resolves.toBeNull();
  });
});
