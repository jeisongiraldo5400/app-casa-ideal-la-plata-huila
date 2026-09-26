import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { RouteOfflineCard } from '../RouteOfflineCard';
import type { RouteOfflineStatus } from '@/lib/collection-routes/routeOffline';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const status = (overrides: Partial<RouteOfflineStatus>): RouteOfflineStatus => ({
  state: 'no_guardada',
  missingNegocioNumeros: [],
  structureChanged: false,
  downloadedAt: null,
  ...overrides,
});

describe('RouteOfflineCard', () => {
  it('recién creada: ofrece descargar la ruta y avisa qué pasa si no se descarga', () => {
    const onDownload = jest.fn();
    const { getByTestId, getByText } = render(
      <RouteOfflineCard status={status({})} online downloading={false} highlight onDownload={onDownload} />
    );
    expect(getByTestId('route-offline-label').props.children).toBe('Pendiente de descargar: la ruta no está en el teléfono');
    getByText(/sin descargar no podrás verla ni cobrar sus paradas sin conexión/);
    fireEvent.press(getByText('Descargar ruta para usar sin señal'));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('guardada: muestra la hora de la descarga', () => {
    const at = new Date();
    at.setHours(9, 5, 0, 0);
    const { getByTestId, getByText } = render(
      <RouteOfflineCard status={status({ state: 'guardada', downloadedAt: at.getTime() })} online downloading={false} onDownload={jest.fn()} />
    );
    expect(getByTestId('route-offline-label').props.children).toMatch(/^Guardada en el teléfono · /);
    getByText('Volver a descargar');
  });

  it('pendiente: lista las paradas cuyo negocio no está en el teléfono', () => {
    const { getByTestId, getByText } = render(
      <RouteOfflineCard
        status={status({ state: 'pendiente', missingNegocioNumeros: [20260007, 20260009] })}
        online
        downloading={false}
        onDownload={jest.fn()}
      />
    );
    expect(getByTestId('route-offline-label').props.children).toBe('Pendiente de descargar: 2 paradas sin datos en el teléfono');
    getByText(/20260007, 20260009/);
  });

  it('sin señal el botón queda deshabilitado', () => {
    const onDownload = jest.fn();
    const { getByTestId, getByText } = render(
      <RouteOfflineCard status={status({})} online={false} downloading={false} onDownload={onDownload} />
    );
    getByText('Sin señal para descargar');
    expect(getByTestId('route-offline-download').props.accessibilityState).toEqual({ disabled: true });
  });

  it('sin señal y ya guardada no muestra botón', () => {
    const { queryByTestId } = render(
      <RouteOfflineCard status={status({ state: 'guardada', downloadedAt: 1 })} online={false} downloading={false} onDownload={jest.fn()} />
    );
    expect(queryByTestId('route-offline-download')).toBeNull();
  });
});
