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
  methodTotalLabel,
  misCobroCuotaLabel,
  pagosScopeFor,
  pagosScopeTitle,
  totalsByMethod,
  type PagosViewer,
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
/** Recaudador puro llamado «Gestor Uno»: solo ve lo que él registró. */
const RECAUDADOR: PagosViewer = { userId: 'u1', userName: 'Gestor Uno', isAdmin: false, isVendedor: false, isGestor: false };
const SELF: Options = { viewer: RECAUDADOR, cashMethodIds: [EFECTIVO] };
const ADMIN: Options = { viewer: { ...RECAUDADOR, isAdmin: true }, cashMethodIds: [EFECTIVO] };

function run(filters: Partial<MisCobrosFilters> = {}, options: Options = SELF) {
  return filterLocalMisCobros(ROWS, { ...DEFAULT_MIS_COBROS_FILTERS, ...filters }, options);
}

describe('filterLocalMisCobros (vista Pagos sin señal)', () => {
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

  it('«Registrado por» otra persona (admin): por nombre y sin los pendientes de este teléfono', () => {
    const result = run({ createdBy: { id: 'u2', name: 'Gestor Dos' } }, ADMIN);
    expect(result.rows.map((row) => row.payment_id)).toEqual(['p6']);
  });

  it('«Registrado por» yo: los míos por nombre más los de este teléfono', () => {
    const result = run({ createdBy: { id: 'u1', name: 'Gestor Uno' } }, ADMIN);
    expect(result.rows.map((row) => row.payment_id)).toEqual(['p5', 'p4', 'p3', 'p2', 'p1']);
  });

  it('el recaudador puro no ve pagos ajenos aunque filtre por otra persona', () => {
    expect(run({ createdBy: { id: 'u2', name: 'Gestor Dos' } }).rows).toHaveLength(0);
  });

  it('las filas conservan quién registró el pago', () => {
    expect(run({}, ADMIN).rows.find((row) => row.payment_id === 'p6')?.created_by_name).toBe('Gestor Dos');
  });

  it('alcance por rol sin señal: admin todo; vendedor y gestor su cartera más lo suyo', () => {
    const rows: LocalMisCobro[] = [
      pago({ payment_id: 'a', created_by_name: 'Otro', negocio_seller_id: 'u1' }),
      pago({ payment_id: 'b', created_by_name: 'Otro', negocio_created_by: 'u1' }),
      pago({ payment_id: 'c', created_by_name: 'Otro', negocio_gestor_cobro_id: 'u1' }),
      pago({ payment_id: 'd', created_by_name: 'Otro' }),
      pago({ payment_id: 'e', created_by_name: 'Gestor Uno' }),
    ];
    const ids = (viewer: Partial<PagosViewer>) =>
      filterLocalMisCobros(rows, DEFAULT_MIS_COBROS_FILTERS, { viewer: { ...RECAUDADOR, ...viewer }, cashMethodIds: null })
        .rows.map((row) => row.payment_id)
        .sort();
    expect(ids({ isAdmin: true })).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids({ isVendedor: true })).toEqual(['a', 'b', 'e']);
    expect(ids({ isGestor: true })).toEqual(['c', 'e']);
    expect(ids({ isVendedor: true, isGestor: true })).toEqual(['a', 'b', 'c', 'e']);
    // Recaudador puro: tiene todos los negocios en el teléfono, pero solo ve lo suyo.
    expect(ids({})).toEqual(['e']);
  });

  it('el alcance y su título, como el servidor', () => {
    expect(pagosScopeFor({ isAdmin: true, isVendedor: true, isGestor: false })).toBe('todos');
    expect(pagosScopeFor({ isAdmin: false, isVendedor: true, isGestor: false })).toBe('cartera');
    expect(pagosScopeFor({ isAdmin: false, isVendedor: false, isGestor: true })).toBe('cartera');
    expect(pagosScopeFor({ isAdmin: false, isVendedor: false, isGestor: false })).toBe('propios');
    expect(pagosScopeTitle('todos')).toBe('Todos los pagos de la empresa');
    expect(pagosScopeTitle('cartera')).toBe('Pagos de tu cartera y los que registraste');
    expect(pagosScopeTitle('propios')).toBe('Pagos que registraste');
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

  it('desglose por método como el servidor: solo lo que suma, de mayor a menor', () => {
    const { summary } = run();
    expect(summary.by_method).toEqual([
      { payment_method_id: EFECTIVO, payment_method_name: 'Efectivo', is_cash: true, count: 2, total: 57000, total_discount: 0 },
      { payment_method_id: CONSIGNACION, payment_method_name: 'Consignación', is_cash: false, count: 1, total: 30000, total_discount: 0 },
    ]);
    // Anulados aparte; los rechazados no están ni en el total ni en lo anulado.
    expect(summary.total_voided).toBe(20000);
    const sum = (summary.by_method ?? []).reduce((total, method) => total + method.total, 0);
    expect(sum).toBe(summary.total_collected);
  });

  it('el desglose sigue a los filtros (fechas, métodos, estado)', () => {
    expect(run({ from: '2026-09-01', to: '2026-09-10' }).summary.by_method?.map((m) => [m.payment_method_id, m.total])).toEqual([
      [EFECTIVO, 50000],
      [CONSIGNACION, 30000],
    ]);
    expect(run({ paymentMethodIds: [CONSIGNACION] }).summary.by_method?.map((m) => m.payment_method_id)).toEqual([CONSIGNACION]);
    const anulados = run({ status: 'anulados' }).summary;
    expect(anulados.by_method).toEqual([]);
    expect(anulados.total_voided).toBe(20000);
  });

  it('sin la lista de efectivo el desglose sale igual pero sin saber cuál es efectivo', () => {
    expect(run({}, { ...SELF, cashMethodIds: null }).summary.by_method?.map((m) => m.is_cash)).toEqual([null, null]);
  });

  it('descuentos de pronto pago y pagos sin método', () => {
    const result = filterLocalMisCobros(
      [
        pago({ payment_id: 'a', amount: 5000, payment_kind: 'pronto_pago', discount_amount: 1000 }),
        pago({ payment_id: 'b', amount: 2000, payment_method_id: null, payment_method_name: null }),
      ],
      DEFAULT_MIS_COBROS_FILTERS,
      SELF
    );
    expect(result.summary.total_discount).toBe(1000);
    expect(result.summary.pronto_pago_count).toBe(1);
    expect(result.summary.by_method).toEqual([
      { payment_method_id: EFECTIVO, payment_method_name: 'Efectivo', is_cash: true, count: 1, total: 5000, total_discount: 1000 },
      { payment_method_id: null, payment_method_name: null, is_cash: false, count: 1, total: 2000, total_discount: 0 },
    ]);
    expect(methodTotalLabel(result.summary.by_method![1])).toBe('Sin método');
  });
});

describe('totalsByMethod', () => {
  it('suma a centavos y ordena por total; empate: sin nombre al final', () => {
    const rows = filterLocalMisCobros(
      [
        pago({ payment_id: 'x', amount: 0.1, payment_method_id: null, payment_method_name: null }),
        pago({ payment_id: 'y', amount: 0.2, payment_method_id: null, payment_method_name: null }),
        pago({ payment_id: 'z', amount: 0.3 }),
      ],
      DEFAULT_MIS_COBROS_FILTERS,
      SELF
    ).rows;
    const groups = totalsByMethod(rows);
    expect(groups.map((g) => [g.payment_method_name, g.total])).toEqual([
      ['Efectivo', 0.3],
      [null, 0.3],
    ]);
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
        createdBy: { id: 'u2', name: 'Otra' },
      })
    ).toBe(4);
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

describe('«Pagos» abre en Hoy y atajo «Por entregar a caja»', () => {
  const ME = { id: 'u1', name: 'Gestor Uno' };
  const now = new Date('2026-09-25T20:00:00Z');

  it('abre en hoy (día de Bogotá) y sin otros filtros', () => {
    expect(initialMisCobrosFilters(now)).toEqual({ ...DEFAULT_MIS_COBROS_FILTERS, from: '2026-09-25', to: '2026-09-25' });
  });

  it('por entregar a caja: vigentes, sin cierre, solo efectivo, de cualquier fecha y con la búsqueda', () => {
    const filters = porEntregarACajaFilters([EFECTIVO], ME, 'ana');
    expect(filters).toEqual({
      ...DEFAULT_MIS_COBROS_FILTERS,
      paymentMethodIds: [EFECTIVO],
      status: 'vigentes',
      inCierre: 'no',
      search: 'ana',
      createdBy: ME,
    });
    expect(isPorEntregarACaja(filters, [EFECTIVO], 'u1')).toBe(true);
  });

  it('deja de ser el atajo si se cambia un filtro, otra persona o no se conoce el efectivo', () => {
    const filters = porEntregarACajaFilters([EFECTIVO], ME);
    expect(isPorEntregarACaja({ ...filters, from: '2026-09-01' }, [EFECTIVO], 'u1')).toBe(false);
    expect(isPorEntregarACaja({ ...filters, paymentMethodIds: [EFECTIVO, CONSIGNACION] }, [EFECTIVO], 'u1')).toBe(false);
    expect(isPorEntregarACaja({ ...filters, createdBy: null }, [EFECTIVO], 'u1')).toBe(false);
    expect(isPorEntregarACaja(filters, [EFECTIVO], 'u2')).toBe(false);
    expect(isPorEntregarACaja(filters, null, 'u1')).toBe(false);
  });
});

describe('misCobroCuotaLabel', () => {
  it('usa la cuota que manda el servidor', () => {
    expect(misCobroCuotaLabel(pago({ cuota_label: 'Inicial + Cuota 1 (parcial)' }))).toBe('Inicial + Cuota 1 (parcial)');
    expect(misCobroCuotaLabel(pago({ payment_kind: 'pronto_pago', cuota_label: 'Pronto pago · cuotas 3–6' }))).toBe(
      'Pronto pago · cuotas 3–6'
    );
  });

  it('sin el dato (sin señal o servidor anterior) muestra lo de antes', () => {
    expect(misCobroCuotaLabel(pago({}))).toBe('Abono a la cuota más antigua');
    expect(misCobroCuotaLabel(pago({ cuota_label: '  ', installment_number: 0 }))).toBe('Cuota inicial');
    expect(misCobroCuotaLabel(pago({ installment_number: 2 }))).toBe('Cuota 2');
    expect(misCobroCuotaLabel(pago({ payment_kind: 'pronto_pago' }))).toBe('Todas (pronto pago)');
  });
});
