import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React, { useState } from 'react';
import { CarteraFilterModal, DEFAULT_CARTERA_FILTERS, type CarteraFilterValues } from '../CarteraFilterModal';
import { searchCollectionManagers } from '@/lib/cartera/carteraService';
import { localDateValue } from '@/lib/localDate';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('@/lib/cartera/carteraService', () => ({ searchCollectionManagers: jest.fn() }));

const mockedManagers = searchCollectionManagers as jest.MockedFunction<typeof searchCollectionManagers>;

/** El modal es controlado: este arnés guarda el borrador como lo hace la pantalla. */
function Harness(props: { initial?: Partial<CarteraFilterValues>; showGestor?: boolean; onApply?: (values: CarteraFilterValues) => void }) {
  const [values, setValues] = useState<CarteraFilterValues>({ ...DEFAULT_CARTERA_FILTERS, ...props.initial });
  return (
    <CarteraFilterModal
      visible
      municipios={[]}
      values={values}
      onChange={setValues}
      onApply={() => props.onApply?.(values)}
      onClose={() => undefined}
      showGestor={props.showGestor}
    />
  );
}

describe('CarteraFilterModal', () => {
  beforeEach(() => {
    mockedManagers.mockReset().mockResolvedValue([{ id: 'g1', full_name: 'Gestora Uno' }]);
  });

  it('tiene «Desde» y «Hasta» por separado y deja elegir días pasados', async () => {
    const onApply = jest.fn();
    const screen = render(<Harness onApply={onApply} />);
    expect(screen.getByText('Desde')).toBeTruthy();
    expect(screen.getByText('Hasta')).toBeTruthy();

    // Mes anterior, día 1: siempre es anterior a hoy.
    fireEvent.press(screen.getByLabelText('Vence desde'));
    fireEvent.press(screen.getAllByLabelText('Mes anterior')[0]);
    const now = new Date();
    const pastDay = localDateValue(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const day = screen.getByLabelText(`Día ${pastDay}`);
    expect(day.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.press(day);

    fireEvent.press(screen.getByText('Aplicar filtros'));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ dueFrom: pastDay, dueTo: '' }));
  });

  it('«Hasta» antes de «Desde» muestra el error y no deja aplicar', () => {
    const onApply = jest.fn();
    const screen = render(<Harness initial={{ dueFrom: '2026-03-10', dueTo: '2026-03-01' }} onApply={onApply} />);
    expect(screen.getByText('«Hasta» no puede ser anterior a «Desde».')).toBeTruthy();

    fireEvent.press(screen.getByText('Aplicar filtros'));
    expect(onApply).not.toHaveBeenCalled();

    // Quitar «Hasta» lo arregla.
    fireEvent.press(screen.getByLabelText('Quitar fecha hasta'));
    fireEvent.press(screen.getByText('Aplicar filtros'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ dueFrom: '2026-03-10', dueTo: '' }));
  });

  it('los atajos llenan el rango (mes pasado)', () => {
    const onApply = jest.fn();
    const screen = render(<Harness onApply={onApply} />);
    fireEvent.press(screen.getByText('Mes pasado'));
    fireEvent.press(screen.getByText('Aplicar filtros'));

    const now = new Date();
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        dueFrom: localDateValue(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        dueTo: localDateValue(new Date(now.getFullYear(), now.getMonth(), 0)),
      })
    );
  });

  it('«Limpiar» deja los valores por defecto y conserva la búsqueda', () => {
    const onApply = jest.fn();
    const screen = render(
      <Harness initial={{ search: '1023', filter: 'mora', municipioId: 'm', dueFrom: '2025-01-01' }} onApply={onApply} />
    );
    expect(screen.getByText('3 filtros activos')).toBeTruthy();

    fireEvent.press(screen.getByText('Limpiar'));
    fireEvent.press(screen.getByText('Aplicar filtros'));
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_CARTERA_FILTERS, search: '1023' });
    expect(screen.queryByText(/filtros? activos?/)).toBeNull();
  });

  it('el gestor de cobro solo aparece para quien lo puede usar, y se elige de la lista', async () => {
    const hidden = render(<Harness />);
    expect(hidden.queryByText('Gestor de cobro')).toBeNull();
    hidden.unmount();

    const onApply = jest.fn();
    const screen = render(<Harness showGestor onApply={onApply} />);
    expect(screen.getByText('Gestor de cobro')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Gestora Uno')).toBeTruthy());

    fireEvent.press(screen.getByText('Gestora Uno'));
    fireEvent.press(screen.getByText('Aplicar filtros'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ gestorId: 'g1', gestorName: 'Gestora Uno' }));
  });

  it('sin señal avisa que la lista de gestores no está disponible', async () => {
    mockedManagers.mockRejectedValue(new Error('Network request failed'));
    const screen = render(<Harness showGestor />);
    await waitFor(() => expect(screen.getByText(/Sin conexión: la lista de gestores/)).toBeTruthy());
    await act(async () => undefined);
  });
});
