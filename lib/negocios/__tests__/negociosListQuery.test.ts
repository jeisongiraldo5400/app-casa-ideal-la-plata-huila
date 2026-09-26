import {
  availableNegociosScopes,
  buildLocalNegocioEntry,
  countActiveNegociosFilters,
  DEFAULT_NEGOCIOS_LIST_FILTERS,
  formatNegocioLocationLine,
  initialNegociosScope,
  mapServerNegocioRow,
  mapServerSummary,
  matchesNegocioSearch,
  queryLocalNegocios,
  statusOptionsForScope,
  type LocalNegocioInput,
  type LocalNegocioEntry,
  type NegociosListFilters,
} from '../negociosListQuery';

const TODAY = '2026-09-25';
const ME = 'gestor-1';

const names = {
  municipios: new Map([
    ['m1', { nombre: 'Álamo', departamentoId: 'd1' }],
    ['m2', { nombre: 'Bosque', departamentoId: 'd1' }],
    ['m3', { nombre: 'Cedral', departamentoId: 'd2' }],
  ]),
  veredas: new Map([
    ['v1', 'La Playa'],
    ['v2', 'El Retiro'],
  ]),
  departamentos: new Map([
    ['d1', 'Antioquia'],
    ['d2', 'Caldas'],
  ]),
};

function input(overrides: Partial<LocalNegocioInput>): LocalNegocioInput {
  return {
    id: 'n',
    numero: 20260001,
    status: 'activo',
    dealDate: '2026-09-01',
    installmentsCount: 1,
    totalCredit: 100000,
    customerId: 'c',
    customerName: 'Cliente',
    customerIdNumber: null,
    sellerId: 'vendedor-1',
    createdBy: 'vendedor-1',
    gestorCobroId: ME,
    deliveryOrderId: null,
    negocioMunicipioId: null,
    negocioAddress: null,
    customerMunicipioId: null,
    customerVeredaId: null,
    customerAddress: null,
    cuotas: [],
    ...overrides,
  };
}

const cuota = (dueDate: string, amount: number, extra: Partial<LocalNegocioInput['cuotas'][number]> = {}) => ({
  dueDate,
  installmentNumber: 1,
  amount,
  paidAmount: 0,
  lateFeeAmount: 0,
  status: 'pendiente',
  ...extra,
});

/** Mismo escenario que la prueba SQL uc61. */
function scenario(): LocalNegocioEntry[] {
  return [
    input({
      id: 'n1',
      numero: 20260001,
      dealDate: '2026-09-01',
      customerName: 'José Peña',
      customerIdNumber: '1.061.111',
      customerMunicipioId: 'm1',
      customerVeredaId: 'v1',
      customerAddress: 'Calle 1',
      cuotas: [cuota('2026-09-05', 100000), cuota('2026-10-25', 100000, { installmentNumber: 2 })],
    }),
    input({
      id: 'n2',
      numero: 20260002,
      status: 'entregado',
      dealDate: '2026-09-02',
      customerName: 'María López',
      customerIdNumber: '61222',
      negocioMunicipioId: 'm2',
      negocioAddress: 'Carrera 2',
      customerMunicipioId: 'm2',
      cuotas: [cuota('2026-09-28', 50000)],
    }),
    input({
      id: 'n3',
      numero: 20260003,
      dealDate: '2026-09-03',
      customerName: 'Ana Ruiz',
      negocioMunicipioId: 'm3',
      cuotas: [cuota('2026-11-04', 300000)],
    }),
    input({ id: 'n4', numero: 20260004, status: 'cerrado', dealDate: '2026-09-04', negocioMunicipioId: 'm1' }),
    input({ id: 'n5', numero: 20260005, status: 'anulado', dealDate: '2026-09-05', negocioMunicipioId: 'm1' }),
    input({
      id: 'n6',
      numero: 20260006,
      dealDate: '2026-09-06',
      customerName: 'Pedro Gómez',
      gestorCobroId: 'gestor-2',
      negocioMunicipioId: 'm1',
      customerMunicipioId: 'm1',
      customerVeredaId: 'v2',
      cuotas: [cuota('2026-09-20', 70000, { status: 'mora' })],
    }),
    input({
      id: 'n7',
      numero: 20260007,
      status: 'borrador',
      dealDate: '2026-09-07',
      customerName: 'María López',
      sellerId: 'admin-1',
      createdBy: 'admin-1',
      negocioMunicipioId: 'm1',
      customerMunicipioId: 'm1',
      customerVeredaId: 'v1',
    }),
    input({
      id: 'n8',
      numero: 20260008,
      dealDate: '2026-09-08',
      sellerId: 'admin-1',
      createdBy: 'vendedor-1',
      gestorCobroId: null,
      negocioMunicipioId: 'm3',
      cuotas: [cuota('2026-10-05', 10000)],
    }),
  ].map((item) => buildLocalNegocioEntry(item, TODAY, names));
}

const run = (filters: Partial<NegociosListFilters> = {}, extra: Partial<Parameters<typeof queryLocalNegocios>[1]> = {}) =>
  queryLocalNegocios(scenario(), {
    scope: 'por_cobrar',
    userId: ME,
    gestorId: null,
    search: '',
    filters: { ...DEFAULT_NEGOCIOS_LIST_FILTERS, ...filters },
    today: TODAY,
    ...extra,
  });
const ids = (result: ReturnType<typeof run>) => result.rows.map((row) => row.id).join(',');

describe('negociosListQuery · modo sin conexión (espejo de list_negocios_movil)', () => {
  it('por cobrar: sólo los del gestor, sin cerrados ni anulados, con resumen', () => {
    const result = run();
    expect(ids(result)).toBe('n7,n3,n2,n1');
    expect(result.summary).toEqual({ totalCount: 4, totalSaldo: 550000, moraCount: 1 });
  });

  it('el admin consulta la cartera de otro gestor', () => {
    const result = run({}, { userId: 'admin-1', gestorId: 'gestor-2' });
    expect(ids(result)).toBe('n6');
    // La vereda sale del cliente porque está en el mismo municipio del negocio.
    expect(result.rows[0].vereda_name).toBe('El Retiro');
    expect(result.rows[0].dias_atraso).toBe(5);
  });

  it('ubicación: sin municipio en el negocio usa la del cliente, con su dirección', () => {
    const n1 = run().rows.find((row) => row.id === 'n1')!;
    expect(n1.municipio_name).toBe('Álamo');
    expect(n1.vereda_name).toBe('La Playa');
    expect(n1.departamento_name).toBe('Antioquia');
    expect(n1.address).toBe('Calle 1');
    const n2 = run().rows.find((row) => row.id === 'n2')!;
    expect(n2.address).toBe('Carrera 2');
    expect(n2.vereda_name).toBeNull();
  });

  it('filtros de ubicación encadenados', () => {
    expect(ids(run({ departamentoId: 'd1' }))).toBe('n7,n2,n1');
    expect(ids(run({ municipioId: 'm1' }))).toBe('n7,n1');
    expect(ids(run({ veredaId: 'v1' }))).toBe('n7,n1');
    expect(run({ veredaId: 'v2' }).summary.totalCount).toBe(0);
    expect(run({ departamentoId: 'd2' }).summary).toEqual({ totalCount: 1, totalSaldo: 300000, moraCount: 0 });
  });

  it('mora: días de atraso, vencido y próxima cuota', () => {
    const n1 = run().rows.find((row) => row.id === 'n1')!;
    expect(n1.has_mora).toBe(true);
    expect(n1.dias_atraso).toBe(20);
    expect(n1.overdue_amount).toBe(100000);
    expect(n1.next_due_date).toBe('2026-09-05');
    expect(n1.remaining_balance).toBe(200000);
    const n2 = run().rows.find((row) => row.id === 'n2')!;
    expect(n2.has_mora).toBe(false);
    expect(n2.dias_atraso).toBeNull();
    expect(n2.next_due_date).toBe('2026-09-28');
    expect(n2.next_due_amount).toBe(50000);
  });

  it('en mora / al día / vence en N días', () => {
    expect(ids(run({ cobro: 'en_mora' }))).toBe('n1');
    expect(ids(run({ cobro: 'al_dia' }))).toBe('n7,n3,n2');
    expect(ids(run({ cobro: 'por_vencer', days: 7 }))).toBe('n2');
    expect(ids(run({ cobro: 'por_vencer', days: 45 }))).toBe('n3,n2,n1');
  });

  it('estado', () => {
    expect(ids(run({ status: 'activos' }))).toBe('n3,n2,n1');
    expect(ids(run({ status: 'entregado' }))).toBe('n2');
    expect(ids(run({ status: 'borradores' }))).toBe('n7');
    expect(run({ status: 'cerrado' }).summary.totalCount).toBe(0);
  });

  it('orden por saldo, atraso y municipio', () => {
    expect(ids(run({ order: 'saldo' }))).toBe('n3,n1,n2,n7');
    expect(ids(run({ order: 'atraso' }))).toBe('n1,n3,n2,n7');
    expect(ids(run({ order: 'municipio' }))).toBe('n1,n7,n2,n3');
  });

  it('búsqueda sin tildes, cédula por dígitos y número', () => {
    expect(ids(run({}, { search: 'jose pena' }))).toBe('n1');
    expect(ids(run({}, { search: 'PEÑA' }))).toBe('n1');
    expect(ids(run({}, { search: '1061111' }))).toBe('n1');
    expect(ids(run({}, { search: '2026-0002' }))).toBe('n2');
    expect(ids(run({ municipioId: 'm1' }, { search: 'maria' }))).toBe('n7');
  });

  it('un término con letras no busca por dígitos', () => {
    const row = run().rows.find((item) => item.id === 'n2')!;
    expect(matchesNegocioSearch(row, 'lopez 61')).toBe(false);
    expect(matchesNegocioSearch(row, '61222')).toBe(true);
    expect(matchesNegocioSearch(row, '')).toBe(true);
  });

  it('todos / míos y el recaudador que sólo busca', () => {
    expect(run({}, { scope: 'todos' }).summary.totalCount).toBe(8);
    // Míos = vendedor del negocio o quien lo registró.
    expect(ids(run({}, { scope: 'mios', userId: 'vendedor-1' }))).toBe('n8,n6,n5,n4,n3,n2,n1');
    expect(run({}, { scope: 'mios' }).summary.totalCount).toBe(0);
    expect(run({}, { scope: 'todos', searchOnly: true }).summary.totalCount).toBe(0);
    expect(ids(run({}, { scope: 'todos', searchOnly: true, search: 'peña' }))).toBe('n1');
  });

  it('sin cuotas descargadas usa el saldo guardado', () => {
    const entry = buildLocalNegocioEntry(input({ id: 'x', storedBalance: 42000 }), TODAY, names);
    expect(entry.row.remaining_balance).toBe(42000);
    expect(entry.row.has_mora).toBe(false);
  });
});

describe('negociosListQuery · servidor y utilidades', () => {
  it('traduce la fila del RPC a la forma de la tarjeta', () => {
    const row = mapServerNegocioRow({
      id: 'n1',
      numero: 20260001,
      status: 'activo',
      customer_name: 'José',
      customer_id_number: '1.061.111',
      remaining_balance: '200000.00',
      has_mora: true,
      dias_atraso: 20,
      remission_number: 'REM-1',
      delivery_order_number: null,
      next_due_amount: null,
      municipio_name: 'Álamo',
    });
    expect(row.customer).toEqual({ name: 'José', id_number: '1.061.111' });
    expect(row.remaining_balance).toBe(200000);
    expect(row.remission).toEqual({ order_number: 'REM-1' });
    expect(row.delivery_order).toBeNull();
    expect(row.next_due_amount).toBeNull();
    expect(mapServerSummary({ total_count: 3, total_saldo: '10.5', mora_count: 1 })).toEqual({
      totalCount: 3,
      totalSaldo: 10.5,
      moraCount: 1,
    });
  });

  it('cuenta filtros activos sin contar el orden', () => {
    expect(countActiveNegociosFilters(DEFAULT_NEGOCIOS_LIST_FILTERS)).toBe(0);
    expect(
      countActiveNegociosFilters({ ...DEFAULT_NEGOCIOS_LIST_FILTERS, departamentoId: 'd', municipioId: 'm', cobro: 'en_mora', order: 'saldo' })
    ).toBe(3);
  });

  it('por cobrar no ofrece cerrados ni anulados', () => {
    const values = statusOptionsForScope('por_cobrar').map((option) => option.value);
    expect(values).not.toContain('cerrado');
    expect(values).not.toContain('anulado');
    expect(statusOptionsForScope('todos').map((option) => option.value)).toContain('cerrado');
  });

  it('pestañas por rol y pestaña inicial', () => {
    const gestor = { isAdmin: false, isVendedor: false, isGestorCobro: true };
    const vendedor = { isAdmin: false, isVendedor: true, isGestorCobro: false };
    const admin = { isAdmin: true, isVendedor: false, isGestorCobro: false };
    const recaudador = { isAdmin: false, isVendedor: false, isGestorCobro: false };
    expect(availableNegociosScopes(gestor)).toEqual(['todos', 'por_cobrar']);
    expect(availableNegociosScopes(vendedor)).toEqual(['todos', 'mios']);
    expect(availableNegociosScopes(admin)).toEqual(['todos', 'por_cobrar']);
    expect(availableNegociosScopes(recaudador)).toEqual(['todos']);
    expect(initialNegociosScope(['todos', 'por_cobrar'], gestor)).toBe('por_cobrar');
    expect(initialNegociosScope(['todos', 'por_cobrar'], admin)).toBe('todos');
    expect(initialNegociosScope(['todos', 'mios'], vendedor, 'mios')).toBe('mios');
    // Una pestaña que el rol no tiene no se abre aunque la pida la ruta.
    expect(initialNegociosScope(['todos'], recaudador, 'mios')).toBe('todos');
  });

  it('línea de ubicación', () => {
    expect(formatNegocioLocationLine({ address: 'Calle 1', vereda_name: 'La Playa', municipio_name: 'Álamo' })).toBe(
      'Calle 1 · La Playa · Álamo'
    );
    expect(formatNegocioLocationLine({ address: null, vereda_name: null, municipio_name: null })).toBe('');
  });
});
