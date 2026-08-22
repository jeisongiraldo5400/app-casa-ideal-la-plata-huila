import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SearchField } from '../SearchField';
import { SegmentedControl } from '../SegmentedControl';
import { StatusChip } from '../StatusChip';
import { Radius, Spacing, getThemeTokens } from '@/constants/theme';

jest.mock('@expo/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

describe('Casa Ideal design system', () => {
  it('keeps the brand palette while exposing shared layout tokens', () => {
    const light = getThemeTokens(false);
    const dark = getThemeTokens(true);

    expect(light.colors.primary.main).toBe('#1e3a8a');
    expect(light.colors.background.default).toBe('#f7f5f1');
    expect(dark.colors.background.default).toBe('#111827');
    expect(Spacing.xl).toBe(20);
    expect(Radius.card).toBe(18);
  });

  it('changes the selected segment and exposes its accessible state', () => {
    const onChange = jest.fn();
    const screen = render(
      <SegmentedControl
        value="pending"
        onChange={onChange}
        items={[
          { value: 'pending', label: 'Pendientes' },
          { value: 'history', label: 'Historial' },
        ]}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Pendientes' }).props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByRole('tab', { name: 'Historial' }));
    expect(onChange).toHaveBeenCalledWith('history');
  });

  it('clears a search with the dedicated accessible action', () => {
    const onChangeText = jest.fn();
    const screen = render(
      <SearchField value="orden 100" onChangeText={onChangeText} />,
    );

    fireEvent.press(screen.getByLabelText('Limpiar búsqueda'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('renders semantic status labels', () => {
    const screen = render(<StatusChip label="Entregada" tone="success" icon="check-circle" />);
    expect(screen.getByText('Entregada')).toBeTruthy();
  });
});
