import { cobroReceiptBalance, cobroReceiptData } from '../cobroReceipt';
import type { MisCobroRow } from '../misCobros';

const row: MisCobroRow = {
  payment_id: 'p1',
  negocio_id: 'n1',
  negocio_numero: 20260007,
  customer_name: 'Ana',
  customer_id_number: '1',
  installment_number: null,
  paid_at: '2026-08-01T15:00:00Z',
  amount: 50_000,
  virtual_receipt_number: 'RV-1',
  receipt_number: null,
  receipt_status: 'emitido',
  payment_method_id: 'm1',
  payment_method_name: 'Efectivo',
  payment_method_is_cash: true,
  payment_site: 'app_movil',
  payment_kind: 'abono',
  cierre_numero: null,
  local_state: null,
  remaining_balance: 20_000,
  remaining_after_payment: 150_000,
};

describe('cobroReceiptData', () => {
  it('el recibo lleva el saldo que quedó tras ese pago, no el de hoy', () => {
    expect(cobroReceiptData(row)?.remainingBalance).toBe(150_000);
  });

  it('con un servidor sin 20261220120000 usa el saldo de hoy (como antes)', () => {
    expect(cobroReceiptBalance({ remaining_balance: 20_000, remaining_after_payment: null })).toBe(20_000);
    expect(cobroReceiptData({ ...row, remaining_after_payment: undefined })?.remainingBalance).toBe(20_000);
  });

  it('un pago del teléfono o sin saldo no tiene recibo', () => {
    expect(cobroReceiptData({ ...row, local_state: 'pendiente' })).toBeNull();
    expect(cobroReceiptData({ ...row, remaining_balance: null, remaining_after_payment: null })).toBeNull();
  });
});
