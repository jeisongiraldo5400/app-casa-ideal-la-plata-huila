import {
  addFrequency,
  buildPendingNegocioPreview,
  pendingNegocioTitle,
} from '../pendingNegocioPreview';
import { calculateCredit } from '@/lib/creditCalculator';
import { buildProntoPagoSummary } from '@/lib/negocios/prontoPago';

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

describe('negocio pendiente con interés manual', () => {
  // 1.000.000 en productos + 200.000 de interés; 300.000 de cuota inicial y
  // 3 cuotas sobre el resto (900.000).
  const calc = calculateCredit({
    productsSubtotal: 1_000_000,
    downPayment: 300_000,
    installmentsCount: 3,
    frequency: 'mensual',
    settings: { formula_type: 'financed_balance', interest_rate_monthly_pct: 0, rounding_unit: 1000, money_decimal_places: 0 },
    manualInterest: 200_000,
  });
  const negocio = {
    products_subtotal: calc.productsSubtotal,
    interest_amount: calc.interestAmount,
    manual_interest_amount: calc.manualInterestAmount,
    total_credit: calc.totalCredit,
    down_payment: calc.downPayment,
    down_payment_schedule: [{ amount: 300_000, due_date: '2026-10-02' }],
    financed_amount: calc.financedAmount,
    installments_count: calc.installmentsCount,
    installment_amount: calc.installmentAmount,
    frequency: 'mensual',
    first_due_date: '2026-11-02',
  };
  const preview = buildPendingNegocioPreview({ negocioId: 'n1', negocio, items: [], productNames: new Map() });

  it('conserva el interés manual y el interés total del comando encolado', () => {
    expect(preview.negocioFields).toMatchObject({
      products_subtotal: 1_000_000,
      interest_amount: 200_000,
      manual_interest_amount: 200_000,
    });
  });

  it('las cuotas suman el total con interés, y el pronto pago parte de ese total', () => {
    const sum = preview.cuotas.reduce((total, cuota) => total + Number(cuota.amount), 0);
    expect(sum).toBe(1_200_000);
    expect(preview.cuotas.map((c) => c.amount)).toEqual([300_000, 300_000, 300_000, 300_000]);
    // El pendiente que liquida el pronto pago es el de las cuotas (incluye el
    // interés), nunca el valor de los productos.
    expect(buildProntoPagoSummary(preview.cuotas).pendingTotal).toBe(1_200_000);
  });
});
