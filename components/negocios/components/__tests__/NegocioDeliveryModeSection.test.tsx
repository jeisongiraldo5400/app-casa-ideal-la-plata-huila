import { fireEvent, render } from '@testing-library/react-native';
import { NegocioDeliveryModeSection } from '../NegocioDeliveryModeSection';
import { filterPendingRemissions } from '../../domain/pendingRemissionSearch';
import type { PendingRemissionOption } from '../../infrastructure/services/negociosDeliveryOrdersService';

// El Icon real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const colors = {
  text: { primary: '#111827', secondary: '#6b7280' },
  primary: { main: '#1e3a8a', contrastText: '#ffffff' },
  background: { default: '#f7f5f1', paper: '#ffffff' },
  divider: '#d1d5db',
};

function remission(id: string, overrides: Partial<PendingRemissionOption> = {}): PendingRemissionOption {
  return {
    id,
    order_number: `OE-2026-${id}`,
    assigned_to_user_id: null,
    assigned_user_name: 'Carlos Muñoz',
    zone_name: 'Inzá',
    created_at: '2026-09-20T10:00:00Z',
    notes: null,
    ...overrides,
  };
}

const list = [
  remission('3409'),
  remission('3410', { assigned_user_name: 'Andrés Pérez', zone_name: 'Belalcázar', notes: 'Camión grande' }),
  remission('3411', { assigned_user_name: null, zone_name: null }),
];

describe('filterPendingRemissions', () => {
  it('término vacío devuelve todas', () => {
    expect(filterPendingRemissions(list, '  ')).toHaveLength(3);
  });

  it('busca por número, responsable sin tildes, zona y notas', () => {
    expect(filterPendingRemissions(list, '3410').map((r) => r.id)).toEqual(['3410']);
    expect(filterPendingRemissions(list, 'munoz').map((r) => r.id)).toEqual(['3409']);
    expect(filterPendingRemissions(list, 'BELALCAZAR').map((r) => r.id)).toEqual(['3410']);
    expect(filterPendingRemissions(list, 'camion').map((r) => r.id)).toEqual(['3410']);
  });

  it('varias palabras deben coincidir todas', () => {
    expect(filterPendingRemissions(list, 'andres belalcazar').map((r) => r.id)).toEqual(['3410']);
    expect(filterPendingRemissions(list, 'andres inza')).toEqual([]);
  });
});

function renderSection(props: Partial<Parameters<typeof NegocioDeliveryModeSection>[0]> = {}) {
  return render(
    <NegocioDeliveryModeSection
      mode="remision"
      onModeChange={jest.fn()}
      remissions={list}
      selectedRemission={null}
      onSelectRemission={jest.fn()}
      colors={colors}
      {...props}
    />
  );
}

describe('NegocioDeliveryModeSection · Enviar en remisión', () => {
  it('filtra la lista con el buscador y dice cuántas coinciden', () => {
    const screen = renderSection();
    fireEvent.changeText(screen.getByTestId('buscar-remision'), 'belalcazar');
    expect(screen.getByText(/OE-2026-3410/)).toBeTruthy();
    expect(screen.queryByText(/OE-2026-3409/)).toBeNull();
    expect(screen.getByText('1 de 3 remisiones')).toBeTruthy();
  });

  it('avisa cuando ninguna coincide', () => {
    const screen = renderSection();
    fireEvent.changeText(screen.getByTestId('buscar-remision'), 'zzz');
    expect(screen.getByTestId('remisiones-sin-coincidencias')).toBeTruthy();
  });

  it('la remisión elegida sigue a la vista aunque el buscador no la encuentre', () => {
    const screen = renderSection({ selectedRemission: list[0] });
    fireEvent.changeText(screen.getByTestId('buscar-remision'), 'belalcazar');
    expect(screen.getByText(/OE-2026-3409/)).toBeTruthy();
    expect(screen.getByText(/OE-2026-3410/)).toBeTruthy();
  });

  it('«Actualizar remisiones» llama a onRefresh y muestra el aviso', () => {
    const onRefresh = jest.fn();
    const screen = renderSection({ onRefresh, refreshNotice: 'Remisiones actualizadas · 3 pendientes.' });
    fireEvent.press(screen.getByTestId('actualizar-remisiones'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('aviso-remisiones')).toBeTruthy();
  });

  it('mientras actualiza, el botón queda deshabilitado', () => {
    const onRefresh = jest.fn();
    const screen = renderSection({ onRefresh, refreshing: true });
    expect(screen.getByText('Actualizando…')).toBeTruthy();
    fireEvent.press(screen.getByTestId('actualizar-remisiones'));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('sin remisiones no muestra el buscador pero sí el botón de actualizar', () => {
    const screen = renderSection({ remissions: [], onRefresh: jest.fn() });
    expect(screen.queryByTestId('buscar-remision')).toBeNull();
    expect(screen.getByTestId('actualizar-remisiones')).toBeTruthy();
  });
});
