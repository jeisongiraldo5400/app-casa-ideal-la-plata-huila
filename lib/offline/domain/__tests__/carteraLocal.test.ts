import {
  applyPagoToCuotas,
  filterCarteraCuotas,
  sortCarteraCuotas,
  searchCustomersLocal,
  summarizeCarteraFromCuotas,
} from '../carteraLocal';
import * as localDate from '@/lib/localDate';

const cuotas = [
  { id: 'c1', dueDate: '2026-08-01', amount: 100, paidAmount: 0, lateFeeAmount: 10, status: 'pendiente' },
  { id: 'c2', dueDate: '2026-09-01', amount: 100, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' },
];

describe('applyPagoToCuotas', () => {
  it('aplica FIFO y no duplica el monto', () => {
    const first = applyPagoToCuotas(cuotas, 50);
    expect(first.cuotas[0].paidAmount).toBe(50);
    expect(first.cuotas[0].status).toBe('parcial');
    expect(first.remainingBalance).toBe(160);
    expect(first.leftover).toBe(0);

    const second = applyPagoToCuotas(first.cuotas, 80);
    expect(second.cuotas[0].status).toBe('pagada');
    expect(second.cuotas[1].paidAmount).toBe(20);
    expect(second.remainingBalance).toBe(80);
  });
});

describe('filterCarteraCuotas', () => {
  const rows = [
    { ...cuotas[0], customerName: 'Ana', customerIdNumber: '111', municipioId: 'm1', negocioNumero: 12, dueDate: '2026-08-20' },
    { ...cuotas[1], customerName: 'Luis', customerIdNumber: '222', municipioId: 'm2', negocioNumero: 13, status: 'mora', dueDate: '2026-07-01' },
  ];

  it('filtra por vendedor cuando se indica', () => {
    const withSeller = [
      { ...rows[0], sellerId: 's1' },
      { ...rows[1], sellerId: 's2' },
      { ...rows[1], id: 'c3', sellerId: null },
    ];
    const base = { filter: 'todas' as const, search: '', days: 15, municipioId: '', today: '2026-08-12' };
    expect(filterCarteraCuotas(withSeller, { ...base, sellerId: 's1' }).map((row) => row.id)).toEqual(['c1']);
    expect(filterCarteraCuotas(withSeller, { ...base, sellerId: 's2' })).toHaveLength(1);
    expect(filterCarteraCuotas(withSeller, base)).toHaveLength(3);
  });

  it('el vendedor del cliente filtra aparte del vendedor del negocio', () => {
    // Un negocio de Ana (vendedora s1) cuyo cliente pertenece a s2: cada filtro
    // mira una columna distinta y se combinan con Y.
    const mixed = [
      { ...rows[0], sellerId: 's1', customerSellerId: 's2' },
      { ...rows[1], id: 'c9', sellerId: 's2', customerSellerId: 's2' },
    ];
    const base = { filter: 'todas' as const, search: '', days: 15, municipioId: '', today: '2026-08-12' };

    expect(filterCarteraCuotas(mixed, { ...base, customerSellerId: 's2' })).toHaveLength(2);
    expect(filterCarteraCuotas(mixed, { ...base, customerSellerId: 's1' })).toHaveLength(0);
    expect(
      filterCarteraCuotas(mixed, { ...base, sellerId: 's1', customerSellerId: 's2' }).map((row) => row.id)
    ).toEqual(['c1']);
  });

  it('acota por rango de vencimiento sin conexión', () => {
    const base = { filter: 'todas' as const, search: '', days: 15, municipioId: '', today: '2026-08-12' };
    // rows[0] vence 2026-08-20 y rows[1] el 2026-07-01.
    expect(filterCarteraCuotas(rows, { ...base, dueFrom: '2026-08-01' }).map((r) => r.id)).toEqual(['c1']);
    expect(filterCarteraCuotas(rows, { ...base, dueTo: '2026-07-31' }).map((r) => r.id)).toEqual(['c2']);
    expect(filterCarteraCuotas(rows, { ...base, dueFrom: '2026-07-01', dueTo: '2026-08-31' })).toHaveLength(2);
    expect(filterCarteraCuotas(rows, { ...base, dueFrom: '2027-01-01' })).toHaveLength(0);
  });

  it('«pagadas» invierte el conjunto de estados', () => {
    const conPagada = [...rows, { ...rows[0], id: 'c9', status: 'pagada' }];
    const base = { search: '', days: 15, municipioId: '', today: '2026-08-12' };
    // Las abiertas nunca incluyen la pagada, y «pagadas» solo la trae a ella.
    expect(filterCarteraCuotas(conPagada, { ...base, filter: 'todas' }).map((r) => r.id)).not.toContain('c9');
    expect(filterCarteraCuotas(conPagada, { ...base, filter: 'pagadas' }).map((r) => r.id)).toEqual(['c9']);
  });

  it('el método de pago se resuelve por negocio, igual que el RPC', () => {
    const conMetodos = [
      { ...rows[0], negocioPaymentMethodIds: ['efectivo'] },
      { ...rows[1], id: 'c8', negocioPaymentMethodIds: ['consignacion'] },
      { ...rows[1], id: 'c9', negocioPaymentMethodIds: [] },
    ];
    const base = { filter: 'todas' as const, search: '', days: 15, municipioId: '', today: '2026-08-12' };

    expect(filterCarteraCuotas(conMetodos, { ...base, paymentMethodId: 'efectivo' }).map((r) => r.id)).toEqual(['c1']);
    // Un negocio sin abonos con ese método queda fuera, no se cuela por defecto.
    expect(filterCarteraCuotas(conMetodos, { ...base, paymentMethodId: 'nequi' })).toHaveLength(0);
    expect(filterCarteraCuotas(conMetodos, base)).toHaveLength(3);
  });

  it('filtra mora y búsqueda', () => {
    expect(filterCarteraCuotas(rows, { filter: 'mora', search: '', days: 15, municipioId: '', today: '2026-08-12' })).toHaveLength(1);
    expect(filterCarteraCuotas(rows, { filter: 'todas', search: 'ana', days: 15, municipioId: '', today: '2026-08-12' })).toHaveLength(1);
  });

  it('usa la fecha calendario local por defecto', () => {
    jest.spyOn(localDate, 'localDateValue').mockReturnValue('2026-08-20');
    expect(filterCarteraCuotas(rows, {
      filter: 'vencidas', search: '', days: 15, municipioId: '',
    })).toHaveLength(1);
    jest.restoreAllMocks();
  });
});

describe('searchCustomersLocal', () => {
  const customers = [
    { name: 'Ana Pérez', idNumber: '123' },
    { name: 'Luis Gómez', idNumber: '456' },
  ];

  it('exige al menos 2 caracteres y prioriza documento exacto', () => {
    expect(searchCustomersLocal(customers, 'a')).toEqual([]);
    expect(searchCustomersLocal(customers, '123')[0].name).toBe('Ana Pérez');
  });
});

describe('summarizeCarteraFromCuotas', () => {
  it('separa saldo pendiente y vencido', () => {
    const summary = summarizeCarteraFromCuotas(
      [
        { id: 'c1', dueDate: '2026-08-20', amount: 100, paidAmount: 20, lateFeeAmount: 0, status: 'pendiente' },
        { id: 'c2', dueDate: '2026-07-01', amount: 50, paidAmount: 0, lateFeeAmount: 10, status: 'mora' },
        { id: 'c3', dueDate: '2026-08-01', amount: 30, paidAmount: 30, lateFeeAmount: 0, status: 'pagada' },
      ],
      '2026-08-12'
    );
    expect(summary.total_balance).toBe(140);
    expect(summary.overdue_balance).toBe(60);
    expect(summary.upcoming_15).toBe(80);
  });
});

describe('sortCarteraCuotas', () => {
  it('ordena por vencimiento, negocio y cuota, como el RPC', () => {
    const desordenadas = [
      { dueDate: '2026-09-01', negocioNumero: 12, installmentNumber: 2 },
      { dueDate: '2026-08-01', negocioNumero: 30, installmentNumber: 1 },
      { dueDate: '2026-09-01', negocioNumero: 12, installmentNumber: 1 },
      { dueDate: '2026-09-01', negocioNumero: 5, installmentNumber: 9 },
    ];

    expect(sortCarteraCuotas(desordenadas)).toEqual([
      { dueDate: '2026-08-01', negocioNumero: 30, installmentNumber: 1 },
      { dueDate: '2026-09-01', negocioNumero: 5, installmentNumber: 9 },
      { dueDate: '2026-09-01', negocioNumero: 12, installmentNumber: 1 },
      { dueDate: '2026-09-01', negocioNumero: 12, installmentNumber: 2 },
    ]);
  });

  it('no muta el arreglo recibido', () => {
    const original = [
      { dueDate: '2026-09-01', negocioNumero: 2, installmentNumber: 1 },
      { dueDate: '2026-08-01', negocioNumero: 1, installmentNumber: 1 },
    ];
    const copia = [...original];
    sortCarteraCuotas(original);
    expect(original).toEqual(copia);
  });
});
