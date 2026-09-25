import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { NegocioDatePicker } from '../NegocioDatePicker';
import { localDateValue } from '@/lib/localDate';

const colors = {
  text: { primary: '#000', secondary: '#666' },
  primary: { main: '#00f', contrastText: '#fff' },
  background: { default: '#fff', paper: '#fff' },
  divider: '#ccc',
};

function pastDay() {
  const now = new Date();
  return localDateValue(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

describe('NegocioDatePicker', () => {
  it('por defecto no deja elegir días pasados (un negocio no se pacta en el pasado)', () => {
    const onChange = jest.fn();
    const screen = render(<NegocioDatePicker value="" onChange={onChange} colors={colors} label="Fecha" />);
    fireEvent.press(screen.getByLabelText('Fecha'));
    fireEvent.press(screen.getByLabelText('Mes anterior'));
    const day = screen.getByLabelText(`Día ${pastDay()}`);
    expect(day.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(day);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('con minDate null deja elegir cualquier fecha; maxDate pone el tope', () => {
    const onChange = jest.fn();
    const screen = render(
      <NegocioDatePicker value="" onChange={onChange} colors={colors} label="Fecha" minDate={null} maxDate={pastDay()} />
    );
    fireEvent.press(screen.getByLabelText('Fecha'));
    fireEvent.press(screen.getByLabelText('Mes anterior'));
    fireEvent.press(screen.getByLabelText(`Día ${pastDay()}`));
    expect(onChange).toHaveBeenCalledWith(pastDay());

    fireEvent.press(screen.getByLabelText('Fecha'));
    const today = screen.getByLabelText(`Día ${localDateValue()}`);
    expect(today.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});
