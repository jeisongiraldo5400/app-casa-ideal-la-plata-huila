import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NegocioContactDetailsSheet } from '../NegocioContactDetailsSheet';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

const mockFetchMasters = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/locations/locationsService', () => ({
  EMPTY_LOCATION_MASTERS: { departamentos: [], municipios: [], veredas: [] },
  fetchLocationMasters: (...args: unknown[]) => mockFetchMasters(...args),
}));

jest.mock('../../infrastructure/services/negocioContactDetailsService', () => ({
  updateNegocioContactDetails: (...args: unknown[]) => mockUpdate(...args),
}));

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const negocio = {
  id: 'n-1',
  numero: 2026001,
  status: 'activo',
  direccion: 'Calle 1',
  municipio_id: 'm-1',
  vereda_id: null,
  notes: null,
  municipioNombre: 'Rionegro',
};

function renderSheet(onSaved = jest.fn()) {
  const utils = render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <NegocioContactDetailsSheet visible negocio={negocio} onClose={jest.fn()} onSaved={onSaved} />
    </SafeAreaProvider>
  );
  return { ...utils, onSaved };
}

describe('NegocioContactDetailsSheet', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockFetchMasters.mockResolvedValue({
      departamentos: [{ id: 'd-1', nombre: 'Antioquia' }],
      municipios: [{ id: 'm-1', nombre: 'Rionegro', departamento_id: 'd-1' }],
      veredas: [],
    });
  });

  it('explica la regla y solo muestra dirección, ubicación y notas', async () => {
    const { getByText, getByLabelText, queryByText } = renderSheet();
    await waitFor(() => expect(mockFetchMasters).toHaveBeenCalled());
    expect(
      getByText(/El negocio 2026001 está Activo: solo se pueden editar la dirección, las notas y el gestor de cobro/)
    ).toBeTruthy();
    expect(getByLabelText('Dirección de la vivienda').props.value).toBe('Calle 1');
    expect(getByLabelText('Notas del negocio')).toBeTruthy();
    expect(queryByText(/Valor unitario/)).toBeNull();
  });

  it('guarda con el RPC y avisa al llamador', async () => {
    mockUpdate.mockResolvedValue({ negocio_id: 'n-1', changed: true, direccion: 'Calle 9', municipio_id: 'm-1', vereda_id: null, notes: 'Portón verde' });
    const { getByLabelText, onSaved } = renderSheet();
    await waitFor(() => expect(mockFetchMasters).toHaveBeenCalled());
    fireEvent.changeText(getByLabelText('Dirección de la vivienda'), 'Calle 9');
    fireEvent.changeText(getByLabelText('Notas del negocio'), 'Portón verde');
    await act(async () => {
      fireEvent.press(getByLabelText('Guardar dirección y notas'));
    });
    expect(mockUpdate).toHaveBeenCalledWith('n-1', {
      direccion: 'Calle 9',
      municipioId: 'm-1',
      veredaId: '',
      notes: 'Portón verde',
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ changed: true }));
  });

  it('muestra el mensaje del servidor si rechaza', async () => {
    mockUpdate.mockRejectedValue({ code: 'P0001', message: 'Sin permiso para editar la dirección y las notas de este negocio' });
    const { getByLabelText, findByText, onSaved } = renderSheet();
    await waitFor(() => expect(mockFetchMasters).toHaveBeenCalled());
    fireEvent.changeText(getByLabelText('Notas del negocio'), 'Otra nota');
    await act(async () => {
      fireEvent.press(getByLabelText('Guardar dirección y notas'));
    });
    expect(await findByText('Sin permiso para editar la dirección y las notas de este negocio')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
