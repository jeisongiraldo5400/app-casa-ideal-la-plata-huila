import {
  addAllToSelection,
  buildLocalCandidates,
  countActiveLocationFilters,
  formatCandidatePlace,
  removeFromSelection,
  toggleSelection,
  type LocalCandidateSource,
  type LocationNames,
  type SelectableStop,
} from '../candidates';
import { EMPTY_ROUTE_LOCATION_FILTER, type CandidateQuery } from '../types';

const TODAY = '2026-09-25';
const ME = 'gestor-1';

const names: LocationNames = {
  departamentos: [
    { id: 'd1', nombre: 'Antioquia' },
    { id: 'd2', nombre: 'Caldas' },
  ],
  municipios: [
    { id: 'm1', nombre: 'Rionegro', departamento_id: 'd1' },
    { id: 'm2', nombre: 'Manizales', departamento_id: 'd2' },
  ],
  veredas: [
    { id: 'v1', nombre: 'La Playa', municipio_id: 'm1' },
    { id: 'v2', nombre: 'Cimarronas', municipio_id: 'm1' },
  ],
};

function source(
  id: string,
  overrides: {
    numero?: number;
    status?: string;
    gestor?: string | null;
    municipioId?: string | null;
    veredaId?: string | null;
    customer?: Partial<NonNullable<LocalCandidateSource['customer']>> | null;
    cuotas?: LocalCandidateSource['cuotas'];
  } = {}
): LocalCandidateSource {
  return {
    negocio: {
      id,
      numero: overrides.numero ?? Number(id.replace(/\D/g, '')),
      status: overrides.status ?? 'activo',
      gestorCobroId: overrides.gestor === undefined ? ME : overrides.gestor,
      direccion: `Calle ${id}`,
      municipioId: overrides.municipioId ?? null,
      veredaId: overrides.veredaId ?? null,
      customerId: `c-${id}`,
    },
    customer:
      overrides.customer === null
        ? null
        : {
            name: `Cliente ${id}`,
            idNumber: `100${id.replace(/\D/g, '')}`,
            phone: null,
            municipioId: null,
            veredaId: null,
            ...overrides.customer,
          },
    cuotas: overrides.cuotas ?? [{ dueDate: '2026-10-20', amount: 100000, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' }],
  };
}

const sources: LocalCandidateSource[] = [
  // Mora; sin ubicación propia → la del cliente (Rionegro, La Playa).
  source('n1', {
    customer: { name: 'José Peña', municipioId: 'm1', veredaId: 'v1' },
    cuotas: [
      { dueDate: '2026-09-15', amount: 100000, paidAmount: 20000, lateFeeAmount: 5000, status: 'mora' },
      { dueDate: '2026-10-15', amount: 100000, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' },
    ],
  }),
  // Al día y vence pronto (en 3 días), Manizales.
  source('n2', {
    municipioId: 'm2',
    status: 'entregado',
    cuotas: [{ dueDate: '2026-09-28', amount: 50000, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' }],
  }),
  // Al día, vence en un mes; negocio en Rionegro, vereda del cliente del mismo municipio.
  source('n3', { municipioId: 'm1', customer: { municipioId: 'm1', veredaId: 'v2' } }),
  // Negocio en Manizales, cliente en Rionegro: la vereda del cliente no aplica.
  source('n4', { municipioId: 'm2', customer: { municipioId: 'm1', veredaId: 'v1' } }),
  // Fuera: otro gestor, cerrado, pagado, sin cliente.
  source('n5', { gestor: 'otro' }),
  source('n6', { status: 'cerrado' }),
  source('n7', { cuotas: [{ dueDate: '2026-09-01', amount: 100000, paidAmount: 100000, lateFeeAmount: 0, status: 'pagada' }] }),
  source('n8', { customer: null }),
];

function run(query: Partial<CandidateQuery> = {}, page = 1, pageSize = 50) {
  return buildLocalCandidates(sources, {
    userId: ME,
    today: TODAY,
    names,
    page,
    pageSize,
    query: { search: '', filter: 'todas', location: EMPTY_ROUTE_LOCATION_FILTER, ...query },
  });
}
const ids = (result: ReturnType<typeof run>) => result.rows.map((row) => row.negocio_id).sort();

describe('buildLocalCandidates (armar la ruta sin señal)', () => {
  it('trae todos los negocios asignados cobrables, no solo los que vencen hoy', () => {
    const result = run();
    expect(ids(result)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(result.totalCount).toBe(4);
  });

  it('calcula saldo, mora y próxima cuota como el servidor', () => {
    const row = run().rows.find((item) => item.negocio_id === 'n1')!;
    expect(row.expected_balance).toBe(185000);
    expect(row.overdue_balance).toBe(85000);
    expect(row.next_due_date).toBe('2026-09-15');
    expect(row.open_installments).toBe(2);
  });

  it('ordena por próximo vencimiento y pagina', () => {
    expect(run().rows.map((row) => row.negocio_id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    const second = run({}, 2, 3);
    expect(second.rows.map((row) => row.negocio_id)).toEqual(['n4']);
    expect(second.totalCount).toBe(4);
    expect(second.rows[0].total_count).toBe(4);
  });

  it('filtra por estado: en mora, al día y vence pronto', () => {
    expect(ids(run({ filter: 'vencidas' }))).toEqual(['n1']);
    expect(ids(run({ filter: 'al_dia' }))).toEqual(['n2', 'n3', 'n4']);
    expect(ids(run({ filter: 'pronto' }))).toEqual(['n2']);
  });

  it('usa la ubicación del negocio y, si no tiene, la del cliente', () => {
    const byMunicipio = run({ location: { departamentoId: '', municipioId: 'm1', veredaId: '' } });
    expect(ids(byMunicipio)).toEqual(['n1', 'n3']);
    expect(ids(run({ location: { departamentoId: 'd2', municipioId: '', veredaId: '' } }))).toEqual(['n2', 'n4']);
    expect(ids(run({ location: { departamentoId: '', municipioId: '', veredaId: 'v1' } }))).toEqual(['n1']);
    expect(ids(run({ location: { departamentoId: '', municipioId: '', veredaId: 'v2' } }))).toEqual(['n3']);
    const n1 = run().rows.find((row) => row.negocio_id === 'n1')!;
    expect(n1).toMatchObject({ municipality_name: 'Rionegro', vereda_name: 'La Playa', departamento_name: 'Antioquia' });
  });

  it('usa la vereda propia del negocio antes que la del cliente', () => {
    const own = buildLocalCandidates(
      [source('n9', { municipioId: 'm1', veredaId: 'v2', customer: { municipioId: 'm1', veredaId: 'v1' } })],
      {
        userId: ME,
        today: TODAY,
        names,
        page: 1,
        pageSize: 50,
        query: { search: '', filter: 'todas', location: { departamentoId: '', municipioId: '', veredaId: 'v2' } },
      }
    );
    expect(own.rows.map((row) => [row.negocio_id, row.vereda_id, row.vereda_name])).toEqual([['n9', 'v2', 'Cimarronas']]);
  });

  it('busca sin tildes por cliente, por cédula y por número', () => {
    expect(ids(run({ search: 'jose pena' }))).toEqual(['n1']);
    expect(ids(run({ search: '1003' }))).toEqual(['n3']);
    expect(ids(run({ search: '4' }))).toEqual(['n4']);
  });
});

describe('selección de paradas', () => {
  const a: SelectableStop = { negocio_id: 'a', negocio_numero: 1, customer_name: 'A', customer_address: 'x' };
  const b: SelectableStop = { negocio_id: 'b', negocio_numero: 2, customer_name: 'B', customer_address: 'x' };
  const locked: SelectableStop = { ...a, negocio_id: 'l', locked: true };

  it('agrega y quita; una visita atendida no se quita', () => {
    expect(toggleSelection([a], b)).toEqual([a, b]);
    expect(toggleSelection([a, b], a)).toEqual([b]);
    expect(toggleSelection([locked], locked)).toEqual([locked]);
  });

  it('seleccionar todos conserva el orden armado, no duplica y respeta el tope', () => {
    expect(addAllToSelection([b], [a, b])).toEqual([b, a]);
    expect(addAllToSelection([a], [b, locked], 2)).toEqual([a, b]);
  });

  it('quitar los filtrados deja las visitas atendidas', () => {
    expect(removeFromSelection([a, b, locked], ['a', 'l'])).toEqual([b, locked]);
  });

  it('cuenta los niveles de ubicación y arma el lugar', () => {
    expect(countActiveLocationFilters({ departamentoId: 'd', municipioId: 'm', veredaId: '' })).toBe(2);
    expect(formatCandidatePlace({ vereda_name: 'La Playa', municipality_name: 'Rionegro' })).toBe('La Playa, Rionegro');
    expect(formatCandidatePlace({ municipality_name: null })).toBe('');
  });
});
