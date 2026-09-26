import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { NegocioPendingSyncBanner } from '../NegocioPendingSyncBanner';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

describe('NegocioPendingSyncBanner', () => {
  it('pendiente: dice que aún no tiene número y no ofrece ir a la cola', () => {
    const screen = render(<NegocioPendingSyncBanner sync={{ state: 'pending', reason: null }} onOpenQueue={jest.fn()} />);
    expect(screen.getByText('Pendiente de enviar · sin número aún')).toBeTruthy();
    expect(screen.queryByText('Ver cambios sin sincronizar')).toBeNull();
  });

  it('rechazado: muestra el motivo y lleva a «Cambios sin sincronizar»', () => {
    const onOpenQueue = jest.fn();
    const screen = render(
      <NegocioPendingSyncBanner sync={{ state: 'rejected', reason: 'Stock insuficiente' }} onOpenQueue={onOpenQueue} />
    );
    expect(screen.getByText('Motivo: Stock insuficiente')).toBeTruthy();
    fireEvent.press(screen.getByText('Ver cambios sin sincronizar'));
    expect(onOpenQueue).toHaveBeenCalled();
  });
});
