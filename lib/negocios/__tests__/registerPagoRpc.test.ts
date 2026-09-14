import {
  buildRegisterPagoRpcCall,
  normalizePagoAmountForServer,
  pagoAmountExceedsBalance,
  pagoAmountInputOptions,
  parsePagoAmountInput,
} from '../registerPagoRpc';

const base = {
  negocioId: 'neg-1',
  amount: 93_333.33,
  paidAt: '2026-09-14T10:00:00.000Z',
  receiptNumber: 'R-1',
  idempotencyKey: 'idem-1',
  paymentMethodId: 'pm-1',
};

describe('buildRegisterPagoRpcCall', () => {
  it('cobro con red fuera de ruta: register_negocio_pago con método de pago y centavos', () => {
    expect(buildRegisterPagoRpcCall(base)).toEqual({
      name: 'register_negocio_pago',
      args: {
        p_negocio_id: 'neg-1',
        p_amount: 93_333.33,
        p_paid_at: '2026-09-14T10:00:00.000Z',
        p_receipt_number: 'R-1',
        p_cuota_id: null,
        p_notes: null,
        p_idempotency_key: 'idem-1',
        p_payment_method_id: 'pm-1',
        p_payment_site: 'app_movil',
      },
    });
  });

  it('cobro en parada de ruta: register_collection_route_payment con la parada y el método', () => {
    const call = buildRegisterPagoRpcCall({ ...base, routeStopId: 'stop-1' });

    expect(call.name).toBe('register_collection_route_payment');
    expect(call.args).toMatchObject({
      p_stop_id: 'stop-1',
      p_amount: 93_333.33,
      p_payment_method_id: 'pm-1',
      p_payment_site: 'app_movil',
    });
    expect(call.args).not.toHaveProperty('p_negocio_id');
  });

  it('redondea el ruido de coma flotante a centavos', () => {
    const call = buildRegisterPagoRpcCall({ ...base, amount: 0.1 + 0.2 + 93_333.03 });

    expect(call.args.p_amount).toBe(93_333.33);
  });

  it('un monto entero viaja idéntico (el hash de idempotencia de comandos viejos no cambia)', () => {
    const call = buildRegisterPagoRpcCall({ ...base, amount: 150_000 });

    expect(call.args.p_amount).toBe(150_000);
    expect(JSON.stringify(call.args.p_amount)).toBe('150000');
  });

  it('comandos viejos sin método ni sitio: null y app móvil', () => {
    const call = buildRegisterPagoRpcCall({ ...base, paymentMethodId: undefined, receiptNumber: undefined });

    expect(call.args).toMatchObject({ p_payment_method_id: null, p_payment_site: 'app_movil', p_receipt_number: null });
  });
});

describe('valor del pago', () => {
  const twoDecimals = pagoAmountInputOptions(2);

  it.each([
    ['93.333,33', 93_333.33],
    ['93333,33', 93_333.33],
    ['93333.33', 93_333.33],
    ['1.500.000', 1_500_000],
    ['10,999', 10.99],
  ])('%p → %p', (text, amount) => {
    expect(parsePagoAmountInput(text, twoDecimals)).toBe(amount);
  });

  it('sin valor devuelve NaN', () => {
    expect(parsePagoAmountInput('', twoDecimals)).toBeNaN();
    expect(parsePagoAmountInput('abc', twoDecimals)).toBeNaN();
  });

  it('respeta los decimales de la configuración (2 si no se conocen)', () => {
    expect(pagoAmountInputOptions(null).decimalPlaces).toBe(2);
    expect(pagoAmountInputOptions(undefined).decimalPlaces).toBe(2);
    expect(pagoAmountInputOptions(0).decimalPlaces).toBe(0);
    expect(pagoAmountInputOptions(4).decimalPlaces).toBe(2);
    expect(parsePagoAmountInput('93.333,33', pagoAmountInputOptions(0))).toBe(93_333);
  });

  it('compara con el saldo en centavos: pagar exactamente el saldo con centavos es válido', () => {
    const saldo = 93_333.33 + 93_333.33 + 93_333.34;
    expect(pagoAmountExceedsBalance(280_000, saldo)).toBe(false);
    expect(pagoAmountExceedsBalance(93_333.33, 93_333.33)).toBe(false);
    expect(pagoAmountExceedsBalance(93_333.34, 93_333.33)).toBe(true);
  });

  it('normalizePagoAmountForServer deja los enteros intactos', () => {
    expect(normalizePagoAmountForServer(50_000)).toBe(50_000);
    expect(normalizePagoAmountForServer(93_333.330000001)).toBe(93_333.33);
  });
});
