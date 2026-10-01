import { parseTransferSummary } from '../transferModel';

describe('parseTransferSummary: quién recibió (20261231340000)', () => {
  it('lee quienes recibieron y la última recepción', () => {
    const order = parseTransferSummary({
      id: 't1',
      status: 'partially_received',
      received_by_names: ['Luis Bodega', 'Ana Bodega', null],
      last_received_at: '2026-09-30T20:00:00Z',
    });
    expect(order.receivedByNames).toEqual(['Luis Bodega', 'Ana Bodega']);
    expect(order.lastReceivedAt).toBe('2026-09-30T20:00:00Z');
  });

  it('servidor sin la migración: vacío', () => {
    const order = parseTransferSummary({ id: 't1', status: 'in_transit' });
    expect(order.receivedByNames).toEqual([]);
    expect(order.lastReceivedAt).toBeNull();
  });
});
