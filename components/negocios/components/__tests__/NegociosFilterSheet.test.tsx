import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DEFAULT_NEGOCIOS_LIST_FILTERS, negociosDatePresetRange } from '@/lib/negocios/negociosListQuery';
import { bogotaDateValue } from '@/lib/localDate';
import { NegociosFilterSheet } from '../NegociosFilterSheet';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
/** Calendario de mentira: muestra el valor y un botón que pone el 2026-09-15. */
jest.mock('../NegocioDatePicker', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    NegocioDatePicker: (props: { value: string; accessibilityLabel?: string; onChange: (value: string) => void }) =>
      mockReact.createElement(
        Pressable,
        { accessibilityLabel: props.accessibilityLabel, onPress: () => props.onChange('2026-09-15') },
        mockReact.createElement(Text, null, props.value || 'Cualquier fecha')
      ),
  };
});
jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    ActionBar: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      mockReact.createElement(Pressable, { onPress }, mockReact.createElement(Text, null, title)),
    FullScreenModal: ({ visible, children, footer }: { visible: boolean; children: React.ReactNode; footer: React.ReactNode }) =>
      visible ? mockReact.createElement(View, null, children, footer) : null,
    OptionPickerField: ({ placeholder, options, onValueChange, disabled }: {
      placeholder: string;
      options: { value: string; label: string }[];
      onValueChange: (value: string) => void;
      disabled?: boolean;
    }) =>
      mockReact.createElement(
        View,
        null,
        mockReact.createElement(Text, null, `${placeholder}${disabled ? ' (bloqueado)' : ''}`),
        ...options.map((option) =>
          mockReact.createElement(
            Pressable,
            { key: option.value, onPress: () => onValueChange(option.value) },
            mockReact.createElement(Text, null, `op:${option.label}`)
          )
        )
      ),
  };
});

const masters = {
  departamentos: [{ id: 'd1', nombre: 'Antioquia' }],
  municipios: [
    { id: 'm1', nombre: 'Álamo', departamento_id: 'd1' },
    { id: 'm9', nombre: 'Otro', departamento_id: 'd9' },
  ],
  veredas: [{ id: 'v1', nombre: 'La Playa', municipio_id: 'm1' }],
};

function renderSheet(scope: 'todos' | 'por_cobrar' = 'por_cobrar', value = DEFAULT_NEGOCIOS_LIST_FILTERS) {
  const onApply = jest.fn();
  render(
    <NegociosFilterSheet visible scope={scope} value={value} masters={masters} onApply={onApply} onClose={jest.fn()} />
  );
  return onApply;
}

describe('NegociosFilterSheet', () => {
  it('departamento → municipio → vereda encadenados, y aplica todo junto', () => {
    const onApply = renderSheet();
    expect(screen.getByText('Elija primero un departamento (bloqueado)')).toBeTruthy();
    fireEvent.press(screen.getByText('op:Antioquia'));
    // Sólo los municipios del departamento elegido.
    expect(screen.getByText('op:Álamo')).toBeTruthy();
    expect(screen.queryByText('op:Otro')).toBeNull();
    fireEvent.press(screen.getByText('op:Álamo'));
    fireEvent.press(screen.getByText('op:La Playa'));
    fireEvent.press(screen.getByLabelText('En mora'));
    fireEvent.press(screen.getByLabelText('Mayor saldo'));
    fireEvent.press(screen.getByText('Aplicar'));
    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_NEGOCIOS_LIST_FILTERS,
      departamentoId: 'd1',
      municipioId: 'm1',
      veredaId: 'v1',
      cobro: 'en_mora',
      order: 'saldo',
    });
  });

  it('«Cuota por vencer» pide los días', () => {
    const onApply = renderSheet();
    expect(screen.queryByLabelText('15 días')).toBeNull();
    fireEvent.press(screen.getByLabelText('Cuota por vencer'));
    fireEvent.press(screen.getByLabelText('15 días'));
    fireEvent.press(screen.getByText('Aplicar'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ cobro: 'por_vencer', days: 15 }));
  });

  it('Por cobrar no ofrece cerrados ni anulados; Todos sí', () => {
    renderSheet('por_cobrar');
    expect(screen.queryByLabelText('Cerrados')).toBeNull();
    expect(screen.getByLabelText('Borradores')).toBeTruthy();
  });

  it('Limpiar quita los filtros y conserva el orden', () => {
    const onApply = renderSheet('todos', {
      ...DEFAULT_NEGOCIOS_LIST_FILTERS,
      municipioId: 'm1',
      status: 'cerrado',
      order: 'municipio',
    });
    expect(screen.getByLabelText('Cerrados')).toBeTruthy();
    fireEvent.press(screen.getByText('Limpiar'));
    fireEvent.press(screen.getByText('Aplicar'));
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_NEGOCIOS_LIST_FILTERS, order: 'municipio' });
  });

  it('fecha del negocio: un atajo pone Desde/Hasta y viaja al aplicar', () => {
    const onApply = renderSheet('todos');
    fireEvent.press(screen.getByText('Este mes'));
    fireEvent.press(screen.getByText('Aplicar'));
    const expected = negociosDatePresetRange('este_mes', bogotaDateValue(new Date()));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('fecha del negocio: Desde a mano, se quita con la x, y un rango al revés avisa', () => {
    const onApply = renderSheet('todos', { ...DEFAULT_NEGOCIOS_LIST_FILTERS, dateTo: '2026-09-01' });
    fireEvent.press(screen.getByLabelText('Fecha del negocio desde'));
    expect(screen.getByText('La fecha «Desde» no puede ser posterior a «Hasta».')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Quitar fecha hasta'));
    expect(screen.queryByText('La fecha «Desde» no puede ser posterior a «Hasta».')).toBeNull();
    fireEvent.press(screen.getByText('Aplicar'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: '2026-09-15', dateTo: '' }));
  });
});
