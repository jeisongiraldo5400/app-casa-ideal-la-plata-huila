import {
  comparePagosOldestFirst,
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

describe('remainingAfterPago con paid_at empatado', () => {
  // Dos abonos a la misma hora: ordenar solo por `paid_at` dejaba a cada uno
  // fuera del "posterior" del otro y ambos recibos imprimían el mismo saldo.
  const cuotas = [{ amount: 100000, paid_amount: 30000 }];
  const primero = {
    id: 'p1',
    amount: 20000,
    paid_at: '2026-09-08T15:00:00-05:00',
    created_at: '2026-09-08T20:00:01.000Z',
    virtual_receipt_number: 'RV-000001',
  };
  const segundo = {
    id: 'p2',
    amount: 10000,
    paid_at: '2026-09-08T15:00:00-05:00',
    created_at: '2026-09-08T20:00:02.000Z',
    virtual_receipt_number: 'RV-000002',
  };
  const pagos = [primero, segundo];

  it('el recibo del primero incluye el importe del segundo', () => {
    expect(remainingAfterPago(cuotas, pagos, primero)).toBe(80000);
  });

  it('el recibo del segundo muestra el saldo final', () => {
    expect(remainingAfterPago(cuotas, pagos, segundo)).toBe(70000);
  });

  it('los dos saldos se diferencian justo en el valor del segundo pago', () => {
    const anterior = remainingAfterPago(cuotas, pagos, primero);
    const posterior = remainingAfterPago(cuotas, pagos, segundo);
    expect(anterior - posterior).toBe(segundo.amount);
  });

  it('desempata por el consecutivo del recibo si created_at también empata', () => {
    const a = { ...primero, created_at: '2026-09-08T20:00:00.000Z' };
    const b = { ...segundo, created_at: '2026-09-08T20:00:00.000Z' };
    expect(comparePagosOldestFirst(a, b)).toBeLessThan(0);
    expect(remainingAfterPago(cuotas, [a, b], a)).toBe(80000);
  });

  it('un pago anulado no descuenta saldo en el recibo anterior', () => {
    const anulado = { ...segundo, receipt_status: 'anulado' };
    expect(remainingAfterPago(cuotas, [primero, anulado], primero)).toBe(70000);
  });
});
