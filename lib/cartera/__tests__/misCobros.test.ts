import {
  countActiveMisCobrosFilters,
  DEFAULT_MIS_COBROS_FILTERS,
  filterLocalMisCobros,
  misCobrosRangeError,
  type LocalMisCobro,
  type MisCobrosFilters,
  matchingMisCobrosPreset,
  misCobrosPresetRange,
  initialMisCobrosFilters,
  isPorEntregarACaja,
  porEntregarACajaFilters,
} from '../misCobros';

const EFECTIVO = 'm-efectivo';
const CONSIGNACION = 'm-consignacion';

function pago(overrides: Partial<LocalMisCobro>): LocalMisCobro {
  return {
    payment_id: 'p',
    negocio_id: 'n1',
    negocio_numero: 20260007,
    customer_name: 'José Peña',
    customer_id_number: '1.023.456',
    installment_number: null,
    paid_at: '2026-09-10T15:00:00.000Z',
    amount: 10000,
    virtual_receipt_number: 'RV-1',
    receipt_number: null,
    receipt_status: 'emitido',
    payment_method_id: EFECTIVO,
    payment_method_name: 'Efectivo',
    payment_site: 'app_movil',
    payment_kind: 'abono',
    created_by_name: 'Gestor Uno',
    sync_status: 'synced',
    ...overrides,
  };
}

const ROWS: LocalMisCobro[] = [
  pago({ payment_id: 'p1', amount: 50000, paid_at: '2026-09-01T15:00:00.000Z' }),
  // 10/09 a las 22:30 en Bogotá (03:30 del 11 en UTC): cuenta como día 10.
  pago({ payment_id: 'p2', amount: 30000, paid_at: '2026-09-11T03:30:00.000Z', payment_method_id: CONSIGNACION, payment_method_name: 'Consignación', payment_site: 'almacen' }),
  pago({ payment_id: 'p3', amount: 20000, paid_at: '2026-09-15T14:00:00.000Z', receipt_status: 'anulado', payment_site: null, customer_name: 'María López', customer_id_number: '57222', negocio_numero: 20260008 }),
  // Registrado sin señal en este teléfono: aún sin enviar y sin nombre.
  pago({ payment_id: 'p4', amount: 7000, paid_at: '2026-09-20T14:00:00.000Z', created_by_name: null, sync_status: 'pending', virtual_receipt_number: null }),
  pago({ payment_id: 'p5', amount: 9000, paid_at: '2026-09-21T14:00:00.000Z', sync_status: 'rejected' }),
  // De otro cobrador.
  pago({ payment_id: 'p6', amount: 99000, created_by_name: 'Gestor Dos' }),
];

type Options = Parameters<typeof filterLocalMisCobros>[2];
const SELF: Options = { collectorName: 'Gestor Uno', isSelf: true, cashMethodIds: [EFECTIVO] };

function run(filters: Partial<MisCobrosFilters> = {}, options: Options = SELF) {
  return filterLocalMisCobros(ROWS, { ...DEFAULT_MIS_COBROS_FILTERS, ...filters }, options);
}

describe('filterLocalMisCobros (Mis cobros sin señal)', () => {
  it('lista los propios (por nombre) y los aún sin enviar; no los de otro cobrador', () => {
    const result = run();
    expect(result.rows.map((row) => row.payment_id)).toEqual(['p5', 'p4', 'p3', 'p2', 'p1']);
    expect(result.rows.find((row) => row.payment_id === 'p4')?.local_state).toBe('pendiente');
    expect(result.rows.find((row) => row.payment_id === 'p5')?.local_state).toBe('rechazado');
    expect(result.rows.find((row) => row.payment_id === 'p1')?.local_state).toBeNull();
  });

  it('totales: vigentes y pendientes suman; anulados y rechazados no', () => {
    const { summary } = run();
    expect(summary.total_count).toBe(5);
    expect(summary.voided_count).toBe(1);
    expect(summary.valid_count).toBe(3);
    expect(summary.total_collected).toBe(87000);
    expect(summary.total_cash).toBe(57000);
    expect(summary.cash_count).toBe(2);
  });

  it('sin la lista de métodos en efectivo no inventa el efectivo', () => {
    const { summary, rows } = run({}, { ...SELF, cashMethodIds: null });
    expect(summary.total_cash).toBeNull();
    expect(summary.cash_count).toBeNull();
    expect(rows[0].payment_method_is_cash).toBeNull();
  });

  it('al consultar a otro cobrador no mezcla los pendientes de este teléfono', () => {
    const result = run({}, { collectorName: 'Gestor Dos', isSelf: false, cashMethodIds: [EFECTIVO] });
    expect(result.rows.map((row) => row.payment_id)).toEqual(['p6']);
  });

  it('filtra por día de Bogotá, con el día final entero', () => {
    expect(run({ from: '2026-09-01', to: '2026-09-10' }).rows.map((row) => row.payment_id)).toEqual(['p2', 'p1']);
    expect(run({ from: '2026-09-11' }).rows.map((row) => row.payment_id)).toEqual(['p5', 'p4', 'p3']);
    expect(run({ from: '2027-01-01', to: '2027-12-31' }).rows).toHaveLength(0);
  });

  it('filtra por varios métodos, por sitio (incluido «No registrado») y por estado', () => {
    expect(run({ paymentMethodIds: [CONSIGNACION] }).rows.map((row) => row.payment_id)).toEqual(['p2']);
    expect(run({ paymentMethodIds: [CONSIGNACION, EFECTIVO] }).rows).toHaveLength(5);
    expect(run({ site: 'almacen' }).rows.map((row) => row.payment_id)).toEqual(['p2']);
    expect(run({ site: 'sin_registro' }).rows.map((row) => row.payment_id)).toEqual(['p3']);
    expect(run({ status: 'anulados' }).rows.map((row) => row.payment_id)).toEqual(['p3']);
    expect(run({ status: 'vigentes' }).rows).toHaveLength(4);
  });

  it('busca sin tildes por cliente, y por dígitos en cédula y negocio', () => {
    expect(run({ search: 'pena' }).rows).toHaveLength(4);
    expect(run({ search: 'MARIA LOPEZ' }).rows.map((row) => row.payment_id)).toEqual(['p3']);
    expect(run({ search: '1023456' }).rows).toHaveLength(4);
    expect(run({ search: '20260008' }).rows.map((row) => row.payment_id)).toEqual(['p3']);
  });

  it('el filtro de cierre no se aplica sin señal (el teléfono no lo sabe)', () => {
    expect(run({ inCierre: 'si' }).rows).toHaveLength(5);
  });
});

describe('ayudas de filtros', () => {
  it('cuenta los filtros activos sin la búsqueda', () => {
    expect(countActiveMisCobrosFilters(DEFAULT_MIS_COBROS_FILTERS)).toBe(0);
    expect(
      countActiveMisCobrosFilters({
        ...DEFAULT_MIS_COBROS_FILTERS,
        from: '2026-09-01',
        paymentMethodIds: ['a', 'b'],
        inCierre: 'no',
        search: 'ana',
      })
    ).toBe(3);
  });

  it('rechaza un rango invertido', () => {
    expect(misCobrosRangeError({ from: '2026-09-10', to: '2026-09-01' })).toMatch(/posterior/);
    expect(misCobrosRangeError({ from: '2026-09-01', to: '2026-09-01' })).toBeNull();
  });
});

describe('misCobrosPresetRange', () => {
  // 15 de marzo de 2026, mediodía en Bogotá.
  const today = new Date('2026-03-15T17:00:00Z');

  it('hoy, últimos 7 días y este mes', () => {
    expect(misCobrosPresetRange('hoy', today)).toEqual({ from: '2026-03-15', to: '2026-03-15' });
    expect(misCobrosPresetRange('semana', today)).toEqual({ from: '2026-03-09', to: '2026-03-15' });
    expect(misCobrosPresetRange('mes', today)).toEqual({ from: '2026-03-01', to: '2026-03-15' });
  });

  it('mes pasado completo, también al cambiar de año', () => {
    expect(misCobrosPresetRange('mes_pasado', today)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(misCobrosPresetRange('mes_pasado', new Date('2026-01-10T17:00:00Z'))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('reconoce qué atajo está puesto', () => {
    expect(matchingMisCobrosPreset({ from: '2026-03-01', to: '2026-03-15' }, today)).toBe('mes');
    expect(matchingMisCobrosPreset({ from: '2026-01-05', to: '2026-02-10' }, today)).toBeNull();
  });
});

describe('«Cobros» abre en Hoy y atajo «Por entregar a caja»', () => {
  const now = new Date('2026-09-25T20:00:00Z');

  it('abre en hoy (día de Bogotá) y sin otros filtros', () => {
    expect(initialMisCobrosFilters(now)).toEqual({ ...DEFAULT_MIS_COBROS_FILTERS, from: '2026-09-25', to: '2026-09-25' });
  });

  it('por entregar a caja: vigentes, sin cierre, solo efectivo, de cualquier fecha y con la búsqueda', () => {
    const filters = porEntregarACajaFilters([EFECTIVO], 'ana');
    expect(filters).toEqual({
      ...DEFAULT_MIS_COBROS_FILTERS,
      paymentMethodIds: [EFECTIVO],
      status: 'vigentes',
      inCierre: 'no',
      search: 'ana',
    });
    expect(isPorEntregarACaja(filters, [EFECTIVO])).toBe(true);
  });

  it('deja de ser el atajo si se cambia un filtro o no se conoce el efectivo', () => {
    const filters = porEntregarACajaFilters([EFECTIVO]);
    expect(isPorEntregarACaja({ ...filters, from: '2026-09-01' }, [EFECTIVO])).toBe(false);
    expect(isPorEntregarACaja({ ...filters, paymentMethodIds: [EFECTIVO, CONSIGNACION] }, [EFECTIVO])).toBe(false);
    expect(isPorEntregarACaja(filters, null)).toBe(false);
  });
});
