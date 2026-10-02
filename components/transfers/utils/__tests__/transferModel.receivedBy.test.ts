import { parseTransferEvent, parseTransferSummary } from '../transferModel';

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

describe('parseTransferSummary: asignados (20261231470000)', () => {
  it('lee quien despacha y quien recibe', () => {
    const order = parseTransferSummary({
      id: 't1',
      status: 'pending_dispatch',
      dispatcher: { id: 'u-1', name: 'Luis Bodega' },
      receiver: { id: 'u-2', name: null },
    });
    expect(order.dispatcher).toEqual({ id: 'u-1', name: 'Luis Bodega' });
    expect(order.receiver).toEqual({ id: 'u-2', name: 'Sin nombre' });
  });

  it('sin asignar o servidor viejo: null', () => {
    expect(parseTransferSummary({ id: 't1', dispatcher: null }).dispatcher).toBeNull();
    expect(parseTransferSummary({ id: 't1' }).receiver).toBeNull();
  });
});

describe('parseTransferEvent: anulaciones', () => {
  it('lee voided y void_reason; por defecto no anulado', () => {
    expect(
      parseTransferEvent({ id: 'e1', event_type: 'receive', voided: true, void_reason: 'Se contó mal' })
    ).toMatchObject({ voided: true, voidReason: 'Se contó mal' });
    expect(parseTransferEvent({ id: 'e2', event_type: 'assignment' })).toMatchObject({
      eventType: 'assignment',
      voided: false,
      voidReason: null,
    });
  });
});
