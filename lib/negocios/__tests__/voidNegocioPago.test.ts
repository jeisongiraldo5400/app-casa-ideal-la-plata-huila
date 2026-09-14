import {
  blockingProntoPagoReceipt,
  canOfferVoidPago,
  validateVoidReason,
  voidBlockedByProntoPagoMessage,
} from '@/lib/negocios/voidNegocioPago';

describe('validateVoidReason', () => {
  it('exige un motivo legible', () => {
    expect(validateVoidReason('')).toBe('El motivo de anulación es obligatorio');
    expect(validateVoidReason('   ')).toBe('El motivo de anulación es obligatorio');
    expect(validateVoidReason('dup')).toMatch(/al menos 5 caracteres/);
    expect(validateVoidReason('Pago registrado dos veces')).toBeNull();
    expect(validateVoidReason('x'.repeat(501))).toMatch(/500 caracteres/);
  });
});

describe('blockingProntoPagoReceipt', () => {
  const abono = { id: 'p1', amount: 100, paid_at: '2026-09-01', receipt_status: 'emitido', virtual_receipt_number: 'RV-1' };
  const pronto = {
    id: 'p2',
    amount: 900,
    paid_at: '2026-09-10',
    receipt_status: 'emitido',
    virtual_receipt_number: 'RV-2',
    payment_kind: 'pronto_pago',
  };

  it('con un pronto pago vigente, otro pago no se anula', () => {
    const receipt = blockingProntoPagoReceipt([pronto, abono], abono);
    expect(receipt).toBe('RV-2');
    expect(voidBlockedByProntoPagoMessage(receipt!)).toBe('Anule primero el pronto pago RV-2 de este negocio');
  });

  it('el propio pronto pago sí se anula, y un pronto pago anulado no bloquea', () => {
    expect(blockingProntoPagoReceipt([pronto, abono], pronto)).toBeNull();
    expect(blockingProntoPagoReceipt([{ ...pronto, receipt_status: 'anulado' }, abono], abono)).toBeNull();
  });
});

describe('canOfferVoidPago', () => {
  const pago = { receipt_status: 'emitido', virtual_receipt_number: 'RV-1' };

  it('solo con permiso, en línea, con datos del servidor y pago vigente', () => {
    expect(canOfferVoidPago({ canVoid: true, online: true, fromLocal: false, pago })).toBe(true);
    expect(canOfferVoidPago({ canVoid: false, online: true, fromLocal: false, pago })).toBe(false);
    expect(canOfferVoidPago({ canVoid: true, online: false, fromLocal: false, pago })).toBe(false);
    expect(canOfferVoidPago({ canVoid: true, online: true, fromLocal: true, pago })).toBe(false);
    expect(canOfferVoidPago({ canVoid: true, online: true, fromLocal: false, pago: { ...pago, receipt_status: 'anulado' } })).toBe(false);
    expect(canOfferVoidPago({ canVoid: true, online: true, fromLocal: false, pago: { ...pago, virtual_receipt_number: null } })).toBe(false);
  });
});
