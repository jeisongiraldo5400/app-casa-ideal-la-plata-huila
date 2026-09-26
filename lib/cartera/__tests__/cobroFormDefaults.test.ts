import { pagoAmountShortcuts, pickDefaultPaymentMethod } from '../cobroFormDefaults';

const METHODS = [
  { id: 'm-cons', name: 'Consignación' },
  { id: 'm-efe', name: 'Efectivo' },
  { id: 'm-addi', name: 'ADDI' },
];

describe('pickDefaultPaymentMethod', () => {
  it('prefiere el último método usado por el usuario', () => {
    expect(pickDefaultPaymentMethod(METHODS, { rememberedId: 'm-addi', cashMethodIds: ['m-efe'] })).toBe('m-addi');
  });

  it('si el recordado ya no está en el catálogo, cae al efectivo marcado is_cash', () => {
    expect(pickDefaultPaymentMethod(METHODS, { rememberedId: 'borrado', cashMethodIds: ['m-efe'] })).toBe('m-efe');
  });

  it('sin la lista de efectivo, usa el que se llama «Efectivo»', () => {
    expect(pickDefaultPaymentMethod(METHODS, { rememberedId: null, cashMethodIds: null })).toBe('m-efe');
  });

  it('sin coincidencias no elige nada (el método sigue siendo obligatorio)', () => {
    expect(pickDefaultPaymentMethod([{ id: 'x', name: 'Tarjeta' }], { rememberedId: null, cashMethodIds: [] })).toBeNull();
    expect(pickDefaultPaymentMethod([], { rememberedId: 'x', cashMethodIds: null })).toBeNull();
  });
});

describe('pagoAmountShortcuts', () => {
  const cuota = (n: number, due: string, amount: number, paid = 0, extra: Record<string, unknown> = {}) => ({
    installment_number: n,
    due_date: due,
    amount,
    paid_amount: paid,
    late_fee_amount: 0,
    status: paid >= amount ? 'pagada' : 'pendiente',
    ...extra,
  });

  it('una cuota vencida con abono parcial y mora, más la cuota actual', () => {
    const result = pagoAmountShortcuts(
      [cuota(1, '2026-09-01', 100_000, 40_000, { late_fee_amount: 2_000, status: 'mora' }), cuota(2, '2026-10-01', 100_000)],
      '2026-09-25',
      162_000
    );
    expect(result).toEqual([
      { key: 'vencido', label: 'Valor de la cuota vencida', amount: 62_000 },
      { key: 'actual', label: 'Cuota actual', amount: 100_000 },
    ]);
  });

  it('varias vencidas: suma y lo dice; ignora pagadas y anuladas', () => {
    const result = pagoAmountShortcuts(
      [
        cuota(1, '2026-07-01', 100_000, 100_000),
        cuota(2, '2026-08-01', 100_000),
        cuota(3, '2026-09-01', 100_000),
        cuota(4, '2026-09-10', 100_000, 0, { status: 'anulada' }),
      ],
      '2026-09-25',
      200_000
    );
    expect(result).toEqual([{ key: 'vencido', label: 'Valor vencido (2 cuotas)', amount: 200_000 }]);
  });

  it('la cuota que vence hoy es la actual, no vencida', () => {
    expect(pagoAmountShortcuts([cuota(1, '2026-09-25', 50_000)], '2026-09-25', 50_000)).toEqual([
      { key: 'actual', label: 'Cuota actual', amount: 50_000 },
    ]);
  });

  it('nunca supera el saldo pendiente y sin cuotas no ofrece nada', () => {
    expect(pagoAmountShortcuts([cuota(1, '2026-09-01', 100_000)], '2026-09-25', 80_000)[0].amount).toBe(80_000);
    expect(pagoAmountShortcuts([], '2026-09-25', 0)).toEqual([]);
    expect(pagoAmountShortcuts(null, '2026-09-25', 0)).toEqual([]);
  });
});
