import {
  countLocalCustomersBySeller,
  filterLocalCustomers,
  matchesCustomerQuery,
  type LocalCustomerRow,
} from '../customersLocal';

const rows: LocalCustomerRow[] = [
  { id: 'c1', name: 'Ana Restrepo', idNumber: '1080123456', phone: '3001112233', sellerId: 's1' },
  { id: 'c2', name: 'Beto Gómez', idNumber: '900222', phone: null, sellerId: 's2' },
  { id: 'c3', name: 'Carla Díaz', idNumber: '900333', phone: null, sellerId: null },
];

describe('matchesCustomerQuery', () => {
  it('un término vacío no filtra', () => {
    expect(matchesCustomerQuery(rows[0], '  ')).toBe(true);
  });
  it('busca por nombre, documento y teléfono', () => {
    expect(matchesCustomerQuery(rows[0], 'restrepo')).toBe(true);
    expect(matchesCustomerQuery(rows[0], '1080')).toBe(true);
    expect(matchesCustomerQuery(rows[0], '3001')).toBe(true);
    expect(matchesCustomerQuery(rows[0], 'zzz')).toBe(false);
  });
});

describe('filterLocalCustomers', () => {
  it('«Mis clientes» filtra por vendedor', () => {
    const result = filterLocalCustomers(rows, { sellerId: 's1' });
    expect(result.items.map((row) => row.id)).toEqual(['c1']);
    expect(result.totalCount).toBe(1);
  });

  it('sin vendedor devuelve el directorio completo ordenado por nombre', () => {
    const result = filterLocalCustomers(rows, {});
    expect(result.items.map((row) => row.name)).toEqual(['Ana Restrepo', 'Beto Gómez', 'Carla Díaz']);
  });

  it('el documento exacto aparece primero', () => {
    const result = filterLocalCustomers(rows, { search: '900333' });
    expect(result.items[0].id).toBe('c3');
  });

  it('pagina sobre el total filtrado', () => {
    const result = filterLocalCustomers(rows, { page: 2, pageSize: 2 });
    expect(result.items).toHaveLength(1);
    expect(result.totalCount).toBe(3);
  });
});

describe('countLocalCustomersBySeller', () => {
  it('cuenta solo los del vendedor', () => {
    expect(countLocalCustomersBySeller(rows, 's1')).toBe(1);
  });
  it('sin vendedor devuelve cero', () => {
    expect(countLocalCustomersBySeller(rows, null)).toBe(0);
  });
});
