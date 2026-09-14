import {
  PRONTO_PAGO_OFFLINE_MESSAGE,
  PRONTO_PAGO_PENDING_SYNC_MESSAGE,
  buildProntoPagoRpcCall,
  buildProntoPagoSummary,
  canOfferProntoPago,
  isProntoPagoBalanceChangedError,
  localProntoPagoPermission,
  negocioPagoErrorMessage,
  parseProntoPagoDiscount,
  prontoPagoBlockReason,
  prontoPagoDecimalPlaces,
  prontoPagoDiscountInputOptions,
  prontoPagoRequestFingerprint,
  validateProntoPago,
} from '@/lib/negocios/prontoPago';

describe('buildProntoPagoSummary', () => {
  it('suma saldo con cuota 0, parcial y mora; excluye pagadas, anuladas y borradas; ordena FIFO', () => {
    const summary = buildProntoPagoSummary([
      { id: 'c2', installment_number: 2, due_date: '2026-11-01', amount: 100000, paid_amount: 0, late_fee_amount: 0, status: 'pendiente' },
      { id: 'c0', installment_number: 0, due_date: '2026-09-01', amount: 50000, paid_amount: 0, late_fee_amount: 0, status: 'pendiente' },
      { id: 'c1', installment_number: 1, due_date: '2026-10-01', amount: 100000, paid_amount: 40000.33, late_fee_amount: 5000, status: 'mora' },
      { id: 'cp', installment_number: 3, due_date: '2026-12-01', amount: 100000, paid_amount: 100000, late_fee_amount: 0, status: 'pagada' },
      { id: 'ca', installment_number: 4, due_date: '2027-01-01', amount: 100000, paid_amount: 0, late_fee_amount: 0, status: 'anulada' },
      { id: 'cd', installment_number: 5, due_date: '2027-02-01', amount: 100000, paid_amount: 0, late_fee_amount: 0, status: 'pendiente', deleted_at: '2026-09-01' },
    ]);

    expect(summary.pendingTotal).toBe(214999.67);
    expect(summary.cuotas.map((cuota) => cuota.id)).toEqual(['c0', 'c1', 'c2']);
    expect(summary.cuotas[1]).toMatchObject({ saldo: 64999.67, lateFee: 5000, installmentNumber: 1 });
  });

  it('redondea a centavos para no fallar la comparación con el esperado', () => {
    const summary = buildProntoPagoSummary([
      { id: 'a', amount: 0.1, paid_amount: 0 },
      { id: 'b', amount: 0.2, paid_amount: 0 },
    ]);
    expect(summary.pendingTotal).toBe(0.3);
    expect(buildProntoPagoSummary(null)).toEqual({ cuotas: [], pendingTotal: 0 });
  });
});

describe('decimales del descuento', () => {
  it('usa el snapshot del negocio, luego la configuración y por último 2', () => {
    expect(prontoPagoDecimalPlaces({ money_decimal_places: 0 }, 2)).toBe(0);
    expect(prontoPagoDecimalPlaces({}, 1)).toBe(1);
    expect(prontoPagoDecimalPlaces(null, null)).toBe(2);
    expect(prontoPagoDecimalPlaces({ money_decimal_places: 7 }, null)).toBe(2);
  });

  it('el campo vacío es descuento $0 y respeta los decimales', () => {
    const options = prontoPagoDiscountInputOptions(2);
    expect(parseProntoPagoDiscount('', options)).toBe(0);
    expect(parseProntoPagoDiscount('100.000,5', options)).toBe(100000.5);
    expect(parseProntoPagoDiscount('100.000,5', prontoPagoDiscountInputOptions(0))).toBe(100000);
  });
});

describe('validateProntoPago', () => {
  const base = { pendingTotal: 1_000_000, discount: 100_000, decimalPlaces: 2, reason: 'Paga todo', paymentMethodId: 'pm-1' };

  it('pendiente − descuento = total a pagar', () => {
    expect(validateProntoPago(base)).toMatchObject({ valid: true, netAmount: 900_000 });
    expect(validateProntoPago({ ...base, pendingTotal: 214999.67, discount: 14999.67 }).netAmount).toBe(200000);
  });

  it('permite descuento $0 (liquidar sin descuento)', () => {
    expect(validateProntoPago({ ...base, discount: 0 })).toMatchObject({ valid: true, netAmount: 1_000_000 });
  });

  it('rechaza descuento negativo, igual o mayor al pendiente', () => {
    expect(validateProntoPago({ ...base, discount: -1 }).discountError).toBe('El descuento no puede ser negativo');
    expect(validateProntoPago({ ...base, discount: 1_000_000 }).discountError).toMatch(
      /^El descuento debe ser menor que el saldo pendiente/
    );
    expect(validateProntoPago({ ...base, discount: 1_200_000 })).toMatchObject({ valid: false, netAmount: 0 });
  });

  it('rechaza más decimales de los permitidos', () => {
    expect(validateProntoPago({ ...base, discount: 100.5, decimalPlaces: 0 }).discountError).toBe(
      'El descuento admite como máximo 0 decimales'
    );
  });

  it('el motivo es opcional (también con descuento > 0 o $0) pero admite máximo 500 caracteres', () => {
    for (const reason of ['', '   ', null, undefined]) {
      expect(validateProntoPago({ ...base, reason: reason as string }).reasonError).toBeNull();
      expect(validateProntoPago({ ...base, reason: reason as string }).valid).toBe(true);
      expect(validateProntoPago({ ...base, discount: 0, reason: reason as string }).valid).toBe(true);
    }
    expect(validateProntoPago({ ...base, reason: 'x'.repeat(500) }).reasonError).toBeNull();
  });

  it('exige método de pago y que haya saldo; limita el largo del motivo', () => {
    expect(validateProntoPago({ ...base, reason: 'x'.repeat(501) }).reasonError).toMatch(/500 caracteres/);
    expect(validateProntoPago({ ...base, paymentMethodId: '' }).methodError).toBe('Seleccione el método de pago');
    expect(validateProntoPago({ ...base, pendingTotal: 0, discount: 0 }).pendingError).toBe(
      'El negocio no tiene saldo pendiente'
    );
  });
});

describe('buildProntoPagoRpcCall', () => {
  const input = {
    negocioId: 'neg-1',
    expectedTotal: 214999.670000001,
    discountAmount: 14999.67,
    discountReason: '  Paga todo  ',
    receiptNumber: ' ',
    paymentMethodId: 'pm-1',
    paidAt: '2026-09-14T15:00:00.000Z',
    idempotencyKey: 'key-1',
  };

  it('fuera de ruta llama a register_negocio_pronto_pago con montos a centavos y sitio app', () => {
    expect(buildProntoPagoRpcCall(input)).toEqual({
      name: 'register_negocio_pronto_pago',
      args: {
        p_negocio_id: 'neg-1',
        p_expected_total: 214999.67,
        p_discount_amount: 14999.67,
        p_discount_reason: 'Paga todo',
        p_paid_at: '2026-09-14T15:00:00.000Z',
        p_receipt_number: null,
        p_notes: null,
        p_payment_method_id: 'pm-1',
        p_idempotency_key: 'key-1',
        p_payment_site: 'app_movil',
      },
    });
  });

  it('desde una parada de ruta llama al envoltorio de la ruta con la parada', () => {
    const call = buildProntoPagoRpcCall({ ...input, routeStopId: 'stop-9' });
    expect(call.name).toBe('register_collection_route_pronto_pago');
    expect(call.args.p_stop_id).toBe('stop-9');
    expect(call.args).not.toHaveProperty('p_negocio_id');
  });

  it('sin motivo (o en blanco) envía p_discount_reason null', () => {
    expect(buildProntoPagoRpcCall({ ...input, discountReason: '   ' }).args.p_discount_reason).toBeNull();
    expect(buildProntoPagoRpcCall({ ...input, discountReason: '' }).args.p_discount_reason).toBeNull();
    expect(buildProntoPagoRpcCall({ ...input, discountReason: null }).args.p_discount_reason).toBeNull();
    expect(buildProntoPagoRpcCall({ ...input, discountReason: undefined }).args.p_discount_reason).toBeNull();
  });
});

describe('huella e interpretación de errores', () => {
  const request = {
    negocioId: 'neg-1',
    expectedTotal: 1_000_000,
    discountAmount: 100_000,
    discountReason: 'Paga todo',
    paymentMethodId: 'pm-1',
  };

  it('la huella cambia con el esperado o el descuento, no con espacios del motivo', () => {
    const fingerprint = prontoPagoRequestFingerprint(request);
    expect(prontoPagoRequestFingerprint({ ...request, discountReason: ' Paga todo ' })).toBe(fingerprint);
    // Sin motivo: vacío, espacios y null son la misma solicitud (se envía null).
    const sinMotivo = prontoPagoRequestFingerprint({ ...request, discountReason: null });
    expect(prontoPagoRequestFingerprint({ ...request, discountReason: '  ' })).toBe(sinMotivo);
    expect(sinMotivo).not.toBe(fingerprint);
    expect(prontoPagoRequestFingerprint({ ...request, expectedTotal: 1_005_000 })).not.toBe(fingerprint);
    expect(prontoPagoRequestFingerprint({ ...request, discountAmount: 0 })).not.toBe(fingerprint);
    expect(prontoPagoRequestFingerprint({ ...request, routeStopId: 'stop-1' })).not.toBe(fingerprint);
  });

  it('reconoce «El saldo del negocio cambió»', () => {
    expect(
      isProntoPagoBalanceChangedError(
        'El saldo del negocio cambió (esperado $ 1.000.000, actual $ 1.005.000). Recargue e intente de nuevo'
      )
    ).toBe(true);
    expect(isProntoPagoBalanceChangedError('El descuento debe ser menor que el saldo pendiente ($ 1)')).toBe(false);
  });

  it('en 42501 conserva el texto del servidor y da uno propio si no lo hay', () => {
    expect(
      negocioPagoErrorMessage({ code: '42501', message: 'Sin permiso para anular pagos de este negocio' }, 'x')
    ).toBe('Sin permiso para anular pagos de este negocio');
    expect(negocioPagoErrorMessage({ code: '42501', message: 'permission denied' }, 'x')).toMatch(
      /gestor de cobro asignado/
    );
    expect(
      negocioPagoErrorMessage({ code: 'P0001', message: 'Anule primero el pronto pago RV-1 de este negocio' }, 'x')
    ).toBe('Anule primero el pronto pago RV-1 de este negocio');
  });
});

describe('disponibilidad', () => {
  it('bloquea sin red, con detalle local o con cobros pendientes de sincronizar', () => {
    expect(prontoPagoBlockReason({ online: false, fromLocal: false, hasPendingSync: false })).toBe(PRONTO_PAGO_OFFLINE_MESSAGE);
    expect(prontoPagoBlockReason({ online: true, fromLocal: true, hasPendingSync: false })).toBe(PRONTO_PAGO_OFFLINE_MESSAGE);
    expect(prontoPagoBlockReason({ online: true, fromLocal: false, hasPendingSync: true })).toBe(PRONTO_PAGO_PENDING_SYNC_MESSAGE);
    expect(prontoPagoBlockReason({ online: true, fromLocal: false, hasPendingSync: false })).toBeNull();
  });

  it('se ofrece en negocios activos o entregados con saldo, con permiso', () => {
    expect(canOfferProntoPago({ status: 'activo', pendingBalance: 1, allowed: true })).toBe(true);
    expect(canOfferProntoPago({ status: 'entregado', pendingBalance: 1, allowed: true })).toBe(true);
    expect(canOfferProntoPago({ status: 'cerrado', pendingBalance: 1, allowed: true })).toBe(false);
    expect(canOfferProntoPago({ status: 'activo', pendingBalance: 0.001, allowed: true })).toBe(false);
    expect(canOfferProntoPago({ status: 'activo', pendingBalance: 100, allowed: false })).toBe(false);
  });

  it('permiso local: admin o gestor asignado; el vendedor no', () => {
    expect(localProntoPagoPermission({ isAdmin: true, isGestorCobro: false, gestorCobroId: null, userId: 'u1' })).toBe(true);
    expect(localProntoPagoPermission({ isAdmin: false, isGestorCobro: true, gestorCobroId: 'u1', userId: 'u1' })).toBe(true);
    expect(localProntoPagoPermission({ isAdmin: false, isGestorCobro: true, gestorCobroId: 'u2', userId: 'u1' })).toBe(false);
    expect(localProntoPagoPermission({ isAdmin: false, isGestorCobro: false, gestorCobroId: 'u1', userId: 'u1' })).toBe(false);
  });
});
