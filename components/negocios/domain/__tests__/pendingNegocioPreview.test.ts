import {
  addFrequency,
  buildPendingNegocioPreview,
  pendingNegocioTitle,
} from '../pendingNegocioPreview';

describe('addFrequency', () => {
  it('suma meses recortando al fin de mes, como interval de Postgres', () => {
    expect(addFrequency('2026-01-31', 'mensual', 1)).toBe('2026-02-28');
    expect(addFrequency('2026-01-31', 'mensual', 2)).toBe('2026-03-31');
    expect(addFrequency('2026-11-15', 'mensual', 3)).toBe('2027-02-15');
  });

  it('semanal y quincenal suman 7 y 15 días', () => {
    expect(addFrequency('2026-09-25', 'semanal', 2)).toBe('2026-10-09');
    expect(addFrequency('2026-09-25', 'quincenal', 1)).toBe('2026-10-10');
  });
});

describe('buildPendingNegocioPreview', () => {
  const negocio = {
    products_subtotal: 300000,
    down_payment: 50000,
    down_payment_schedule: [
      { amount: 30000, due_date: '2026-09-30' },
      { amount: 20000, due_date: '2026-09-26' },
    ],
    installments_count: 2,
    installment_amount: 125000,
    frequency: 'mensual',
    first_due_date: '2026-10-31',
    notes: 'Entregar en la tarde',
    seller_id: 'no-se-copia',
  };

  it('productos con nombre del catálogo, abonos iniciales como cuota 0 y plan de cuotas', () => {
    const preview = buildPendingNegocioPreview({
      negocioId: 'n1',
      negocio,
      items: [
        { product_id: 'p1', quantity: 2, unit_price: 100000, subtotal: 200000, description: '', warehouse_id: 'w1' },
        { product_id: 'p2', quantity: 1, unit_price: 100000, description: 'Colchón doble' },
      ],
      productNames: new Map([['p1', { name: 'Nevera', sku: 'NEV-1' }]]),
    });

    expect(preview.items).toEqual([
      expect.objectContaining({ product_id: 'p1', quantity: 2, subtotal: 200000, description: null, product: { name: 'Nevera', sku: 'NEV-1' } }),
      expect.objectContaining({ product_id: 'p2', subtotal: 100000, description: 'Colchón doble', product: { name: null, sku: null } }),
    ]);
    expect(preview.cuotas.map((c) => [c.installment_number, c.due_date, c.amount])).toEqual([
      [0, '2026-09-26', 20000],
      [0, '2026-09-30', 30000],
      [1, '2026-10-31', 125000],
      [2, '2026-11-30', 125000],
    ]);
    expect(preview.cuotas.every((c) => c.status === 'pendiente' && c.paid_amount === 0)).toBe(true);
    expect(preview.negocioFields).toMatchObject({ products_subtotal: 300000, installments_count: 2, notes: 'Entregar en la tarde' });
    expect(preview.negocioFields).not.toHaveProperty('seller_id');
  });

  it('sin cuotas ni abonos no inventa un plan', () => {
    const preview = buildPendingNegocioPreview({
      negocioId: 'n1',
      negocio: { installments_count: 0, down_payment_schedule: [] },
      items: [],
      productNames: new Map(),
    });
    expect(preview.cuotas).toEqual([]);
  });
});

describe('pendingNegocioTitle', () => {
  it('dice que aún no tiene número', () => {
    expect(pendingNegocioTitle({ state: 'pending', reason: null })).toBe('Pendiente de enviar · sin número aún');
    expect(pendingNegocioTitle({ state: 'rejected', reason: 'x' })).toBe('No se pudo enviar · sin número');
  });
});
