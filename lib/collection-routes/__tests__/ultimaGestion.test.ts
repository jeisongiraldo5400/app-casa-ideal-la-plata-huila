import { labelUltimaGestion, latestGestionByNegocio, type UltimaGestion } from '../ultimaGestion';

const g = (overrides: Partial<UltimaGestion>): UltimaGestion => ({
  negocio_id: 'n1',
  stop_status: 'sin_pago',
  outcome_reason: 'No estaba',
  notes: null,
  occurred_at: '2026-09-05T20:00:00Z',
  route_date: '2026-09-05',
  gestor_name: null,
  ...overrides,
});

describe('latestGestionByNegocio', () => {
  it('se queda con la más reciente de cada negocio', () => {
    const result = latestGestionByNegocio([
      g({}),
      g({ stop_status: 'reprogramado', occurred_at: '2026-09-12T16:00:00Z', outcome_reason: 'Paga el viernes' }),
      g({ negocio_id: 'n2' }),
    ]);
    expect(result.get('n1')?.stop_status).toBe('reprogramado');
    expect(result.get('n2')?.stop_status).toBe('sin_pago');
  });

  it('en un empate gana la primera (la del servidor, con el nombre del gestor)', () => {
    const result = latestGestionByNegocio([
      g({ gestor_name: 'Gestor' }),
      g({ occurred_at: '2026-09-05T20:00:00.000Z', gestor_name: null }),
    ]);
    expect(result.get('n1')?.gestor_name).toBe('Gestor');
  });

  it('sin hora usa la fecha de la ruta', () => {
    const result = latestGestionByNegocio([g({ occurred_at: null, route_date: '2026-09-20' }), g({})]);
    expect(result.get('n1')?.route_date).toBe('2026-09-20');
  });
});

it('labelUltimaGestion: estado · motivo · fecha', () => {
  expect(labelUltimaGestion(g({}))).toMatch(/^Sin pago · No estaba · 5 (de )?sep/);
  expect(labelUltimaGestion(g({ stop_status: 'reprogramado', outcome_reason: '  ' }))).toMatch(/^Reprogramado · 5 (de )?sep/);
});
