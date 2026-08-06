import { compositeKey } from '../compositeKey';
import {
  aggregateRegisteredTotalForGroup,
  buildRegisteredTotalsByKey,
  computeFifoProgressByItemId,
  sortLinesFifo,
  type FifoAllocatableLine,
} from '../fifoDeliveryAllocation';

const line = (
  partial: Partial<FifoAllocatableLine> & Pick<FifoAllocatableLine, 'id'>
): FifoAllocatableLine => ({
  product_id: 'p1',
  warehouse_id: 'w1',
  quantity: 5,
  db_delivered_quantity: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  ...partial,
});

describe('fifoDeliveryAllocation', () => {
  it('sortLinesFifo orders by created_at then id', () => {
    const sorted = sortLinesFifo([
      line({ id: 'b', created_at: '2026-01-02T00:00:00.000Z' }),
      line({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' }),
      line({ id: 'c', created_at: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((l) => l.id)).toEqual(['a', 'c', 'b']);
  });

  it('aggregateRegisteredTotalForGroup reconciles DB vs exits and caps by qty', () => {
    const lines = [
      line({ id: '1', quantity: 3, db_delivered_quantity: 1 }),
      line({ id: '2', quantity: 2, db_delivered_quantity: 0 }),
    ];
    expect(aggregateRegisteredTotalForGroup(lines, 0)).toBe(1);
    expect(aggregateRegisteredTotalForGroup(lines, 4)).toBe(4);
    expect(aggregateRegisteredTotalForGroup(lines, 99)).toBe(5);
  });

  it('computeFifoProgressByItemId allocates registered and session oldest-first', () => {
    const items = [
      line({ id: 'old', quantity: 3, created_at: '2026-01-01T00:00:00.000Z' }),
      line({ id: 'new', quantity: 3, created_at: '2026-01-02T00:00:00.000Z' }),
    ];
    const key = compositeKey('p1', 'w1');
    const progress = computeFifoProgressByItemId(
      items,
      { [key]: 4 },
      new Map([[key, 1]])
    );

    expect(progress.get('old')).toEqual({
      registered: 3,
      sessionScanned: 0,
      pending: 0,
    });
    expect(progress.get('new')).toEqual({
      registered: 1,
      sessionScanned: 1,
      pending: 1,
    });
  });

  it('buildRegisteredTotalsByKey groups by product+warehouse', () => {
    const items = [
      line({ id: '1', quantity: 2, db_delivered_quantity: 1 }),
      line({
        id: '2',
        product_id: 'p2',
        quantity: 4,
        db_delivered_quantity: 0,
      }),
    ];
    const cache = buildRegisteredTotalsByKey(items, {
      [compositeKey('p1', 'w1')]: 0,
      [compositeKey('p2', 'w1')]: 3,
    });
    expect(cache[compositeKey('p1', 'w1')]).toBe(1);
    expect(cache[compositeKey('p2', 'w1')]).toBe(3);
  });
});
