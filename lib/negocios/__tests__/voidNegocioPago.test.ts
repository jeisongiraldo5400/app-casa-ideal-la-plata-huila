import {
  blockingProntoPagoReceipt,
  canOfferVoidPago,
  isPagoEnCierre,
  validateVoidReason,
  voidBlockedByCierreMessage,
  voidBlockedByProntoPagoMessage,
  voidBlockedMessage,
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

  it('no se ofrece sobre un pago incluido en un cierre de recaudo', () => {
    expect(canOfferVoidPago({ canVoid: true, online: true, fromLocal: false, pago: { ...pago, cierre_id: 'c1' } })).toBe(false);
    expect(canOfferVoidPago({ canVoid: true, online: true, fromLocal: false, pago: { ...pago, cierre_id: null } })).toBe(true);
  });
});

describe('pagos en un cierre de recaudo', () => {
  const abono = { id: 'p1', amount: 100, paid_at: '2026-09-01', receipt_status: 'emitido', virtual_receipt_number: 'RV-1' };
  const pronto = {
    id: 'p2',
    amount: 900,
    paid_at: '2026-09-10',
    receipt_status: 'emitido',
    virtual_receipt_number: 'RV-2',
    payment_kind: 'pronto_pago',
  };

  it('repite el mensaje del servidor, con o sin número de cierre', () => {
    expect(isPagoEnCierre({ cierre_id: 'c1' })).toBe(true);
    expect(isPagoEnCierre({ cierre_id: null })).toBe(false);
    expect(voidBlockedByCierreMessage({ cierre_numero: 'CR-2026-0007' })).toBe(
      'Solo un administrador puede anular un pago incluido en un cierre de recaudo (CR-2026-0007).'
    );
    expect(voidBlockedByCierreMessage({ cierre_numero: null })).toBe(
      'Solo un administrador puede anular un pago incluido en un cierre de recaudo.'
    );
  });

  it('bloquea el pago en cierre y, en cascada, el abono cuyo pronto pago está en un cierre', () => {
    expect(voidBlockedMessage([abono], abono)).toBeNull();
    expect(voidBlockedMessage([abono], { ...abono, cierre_id: 'c1', cierre_numero: 'CR-2026-0001' })).toBe(
      'Solo un administrador puede anular un pago incluido en un cierre de recaudo (CR-2026-0001).'
    );
    expect(voidBlockedMessage([pronto, abono], abono)).toBe('Anule primero el pronto pago RV-2 de este negocio');
    expect(
      voidBlockedMessage([{ ...pronto, cierre_id: 'c2', cierre_numero: 'CR-2026-0002' }, abono], abono)
    ).toBe(
      'No se puede anular el pago RV-1: el pronto pago RV-2 de este negocio está incluido en el cierre de recaudo CR-2026-0002 y solo un administrador puede anularlo.'
    );
  });
});
