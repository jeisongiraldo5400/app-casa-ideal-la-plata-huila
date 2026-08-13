import {
  applyPagoToCuotas,
  filterCarteraCuotas,
  searchCustomersLocal,
} from '../carteraLocal';

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

  it('filtra mora y búsqueda', () => {
    expect(filterCarteraCuotas(rows, { filter: 'mora', search: '', days: 15, municipioId: '', today: '2026-08-12' })).toHaveLength(1);
    expect(filterCarteraCuotas(rows, { filter: 'todas', search: 'ana', days: 15, municipioId: '', today: '2026-08-12' })).toHaveLength(1);
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
