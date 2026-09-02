import {
  computeRemainingBalance,
  cuotaSaldo,
  remainingAfterPago,
} from '@/lib/negocios/negocioBalance';

describe('negocioBalance', () => {
  const cuotas = [
    { amount: 100000, paid_amount: 100000, late_fee_amount: 0, status: 'pagada' },
    { amount: 100000, paid_amount: 40000, late_fee_amount: 5000, status: 'mora' },
    { amount: 100000, paid_amount: 0, late_fee_amount: 0, status: 'pendiente' },
    { amount: 100000, paid_amount: 0, late_fee_amount: 0, status: 'anulada' },
    { amount: 100000, paid_amount: 0, late_fee_amount: 0, status: 'pendiente', deleted_at: '2026-01-01' },
  ];

  it('suma saldo con mora y excluye anuladas/borradas', () => {
    expect(computeRemainingBalance(cuotas)).toBe(165000);
  });

  it('tolera valores string/null como los devuelve PostgREST', () => {
    expect(cuotaSaldo({ amount: '1000.00', paid_amount: null, late_fee_amount: '50' })).toBe(1050);
    expect(computeRemainingBalance(null)).toBe(0);
    expect(computeRemainingBalance([])).toBe(0);
  });

  it('no deja saldos negativos por sobrepago en una cuota', () => {
    expect(computeRemainingBalance([{ amount: 100, paid_amount: 150 }])).toBe(0);
  });

  it('reconstruye el saldo posterior a un pago histórico', () => {
    const pagos = [
      { id: 'p3', amount: 20000, paid_at: '2026-03-01T10:00:00Z', receipt_status: 'emitido' },
      { id: 'p2', amount: 30000, paid_at: '2026-02-01T10:00:00Z', receipt_status: 'anulado' },
      { id: 'p1', amount: 40000, paid_at: '2026-01-01T10:00:00Z', receipt_status: 'emitido' },
    ];
    expect(remainingAfterPago(cuotas, pagos, pagos[2])).toBe(185000);
    expect(remainingAfterPago(cuotas, pagos, pagos[0])).toBe(165000);
  });
});
