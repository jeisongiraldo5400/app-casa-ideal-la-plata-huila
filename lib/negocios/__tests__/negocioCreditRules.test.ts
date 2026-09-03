import {
  downPaymentRowsToSchedule,
  downPaymentScheduleError,
  downPaymentScheduleTotal,
  financedAfterDownPayments,
  installmentPlanError,
  installmentsRangeError,
  isInstallmentsCountAllowed,
  parseDownPaymentSchedule,
  requiresInstallmentPlan,
} from '../negocioCreditRules';

describe('installmentsRangeError', () => {
  it('acepta cualquier entero positivo (el vendedor define la cantidad de cuotas)', () => {
    expect(installmentsRangeError(1)).toBeNull();
    expect(installmentsRangeError(3)).toBeNull();
    expect(installmentsRangeError(36)).toBeNull();
    expect(installmentsRangeError(200)).toBeNull();
    expect(isInstallmentsCountAllowed(200)).toBe(true);
  });

  it('rechaza valores no enteros o menores a 1', () => {
    expect(installmentsRangeError(0)).toBeTruthy();
    expect(installmentsRangeError(-4)).toBeTruthy();
    expect(installmentsRangeError(2.5)).toBeTruthy();
    expect(installmentsRangeError(Number.NaN)).toBeTruthy();
    expect(isInstallmentsCountAllowed(0)).toBe(false);
  });
});

describe('downPaymentScheduleError', () => {
  const deal = '2026-09-03';

  it('acepta un cronograma vacío (sin cuota inicial)', () => {
    expect(downPaymentScheduleError([], deal, 1_000_000)).toBeNull();
  });

  it('exige monto y fecha válidos en cada abono', () => {
    expect(downPaymentScheduleError([{ amount: 0, due_date: deal }], deal, 1_000_000)).toMatch(/valor de la cuota inicial/);
    expect(downPaymentScheduleError([{ amount: 50_000, due_date: '' }], deal, 1_000_000)).toMatch(/fecha de pago de la cuota inicial/);
    expect(
      downPaymentScheduleError(
        [
          { amount: 50_000, due_date: deal },
          { amount: Number.NaN, due_date: '2026-09-11' },
        ],
        deal,
        1_000_000
      )
    ).toMatch(/valor del abono 2/);
  });

  it('rechaza fechas anteriores al negocio y fechas repetidas', () => {
    expect(downPaymentScheduleError([{ amount: 50_000, due_date: '2026-09-02' }], deal, 1_000_000)).toMatch(/anterior/);
    expect(
      downPaymentScheduleError(
        [
          { amount: 50_000, due_date: deal },
          { amount: 20_000, due_date: deal },
        ],
        deal,
        1_000_000
      )
    ).toMatch(/misma fecha/);
  });

  it('no permite superar el valor de los productos', () => {
    expect(
      downPaymentScheduleError(
        [
          { amount: 600_000, due_date: deal },
          { amount: 500_000, due_date: '2026-09-11' },
        ],
        deal,
        1_000_000
      )
    ).toMatch(/superar/);
    expect(
      downPaymentScheduleError(
        [
          { amount: 600_000, due_date: deal },
          { amount: 400_000, due_date: '2026-09-11' },
        ],
        deal,
        1_000_000
      )
    ).toBeNull();
  });
});

describe('plan de cuotas', () => {
  const deal = '2026-09-03';
  const parcial = [
    { amount: 300_000, due_date: deal },
    { amount: 200_000, due_date: '2026-09-11' },
  ];
  const total = [
    { amount: 600_000, due_date: deal },
    { amount: 400_000, due_date: '2026-09-11' },
  ];

  it('calcula el saldo por financiar y si hace falta plan', () => {
    expect(downPaymentScheduleTotal(parcial)).toBe(500_000);
    expect(financedAfterDownPayments(1_000_000, parcial)).toBe(500_000);
    expect(requiresInstallmentPlan(1_000_000, parcial)).toBe(true);
    expect(financedAfterDownPayments(1_000_000, total)).toBe(0);
    expect(requiresInstallmentPlan(1_000_000, total)).toBe(false);
  });

  it('con saldo exige cuotas y fecha de primera cuota', () => {
    expect(installmentPlanError(500_000, 0, '2026-10-03', deal)).toMatch(/entero mayor a 0/);
    expect(installmentPlanError(500_000, 3, '', deal)).toMatch(/fecha de la primera cuota/);
    expect(installmentPlanError(500_000, 3, '2026-09-01', deal)).toMatch(/anterior/);
    expect(installmentPlanError(500_000, 3, '2026-10-03', deal)).toBeNull();
  });

  it('sin saldo no admite cuotas', () => {
    expect(installmentPlanError(0, 3, '2026-10-03', deal)).toMatch(/no lleva cuotas/);
    expect(installmentPlanError(0, 0, null, deal)).toBeNull();
  });
});

describe('parseDownPaymentSchedule', () => {
  it('lee el jsonb ordenado por fecha y descarta entradas inválidas', () => {
    expect(
      parseDownPaymentSchedule([
        { amount: '200000', due_date: '2026-09-11' },
        { amount: 300000, due_date: '2026-09-03' },
        { amount: 0, due_date: '2026-09-20' },
        null,
      ])
    ).toEqual([
      { amount: 300_000, due_date: '2026-09-03' },
      { amount: 200_000, due_date: '2026-09-11' },
    ]);
  });

  it('reconstruye un solo abono desde negocios antiguos sin cronograma', () => {
    expect(parseDownPaymentSchedule([], { down_payment: 50_000, down_payment_date: null, deal_date: '2026-08-01' })).toEqual([
      { amount: 50_000, due_date: '2026-08-01' },
    ]);
    expect(parseDownPaymentSchedule(null, { down_payment: 0, deal_date: '2026-08-01' })).toEqual([]);
  });

  it('convierte filas del formulario con montos formateados', () => {
    expect(downPaymentRowsToSchedule([{ key: 'a', amount: '1.500.000', dueDate: '2026-09-03' }])).toEqual([
      { amount: 1_500_000, due_date: '2026-09-03' },
    ]);
  });
});
