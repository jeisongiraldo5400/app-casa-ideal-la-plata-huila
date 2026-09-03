import { downPaymentDateError } from '../negocioCreditRules';

describe('downPaymentDateError', () => {
  it('no exige fecha cuando no hay cuota inicial', () => {
    expect(downPaymentDateError(0, '', '2026-09-03')).toBeNull();
  });

  it('exige fecha válida cuando hay cuota inicial', () => {
    expect(downPaymentDateError(50000, '', '2026-09-03')).toMatch(/fecha de pago/);
  });

  it('rechaza fechas anteriores al negocio', () => {
    expect(downPaymentDateError(50000, '2026-09-02', '2026-09-03')).toMatch(/anterior/);
    expect(downPaymentDateError(50000, '2026-09-03', '2026-09-03')).toBeNull();
  });
});
