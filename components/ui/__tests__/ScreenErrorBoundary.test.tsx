import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { logOperationError } from '@/lib/operationLogger';
import * as Sentry from '@sentry/react-native';
import { DEFAULT_CRASH_LOG_MODULE, SCREEN_CRASH_MESSAGE, ScreenErrorBoundary } from '../ScreenErrorBoundary';

jest.mock('@/lib/operationLogger', () => ({ logOperationError: jest.fn(async () => undefined) }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: true }) }));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));

function Boom(): React.ReactElement {
  throw new Error('Cannot read property x of undefined');
}

describe('ScreenErrorBoundary', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  });

  it('muestra un mensaje en español y deja el detalle técnico tras «Ver detalle»', () => {
    render(<ScreenErrorBoundary screen="Salidas"><Boom /></ScreenErrorBoundary>);

    expect(screen.getByText('Algo salió mal en Salidas')).toBeTruthy();
    expect(screen.getByText(SCREEN_CRASH_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/Cannot read property/)).toBeNull();

    fireEvent.press(screen.getByText('Ver detalle'));
    expect(screen.getByText(/Cannot read property x of undefined/)).toBeTruthy();
  });

  it('registra el fallo aunque la pantalla no pase logModule', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    render(<ScreenErrorBoundary screen="Inicio"><Boom /></ScreenErrorBoundary>);

    expect(logOperationError).toHaveBeenCalledWith(
      expect.objectContaining({
        error_code: 'SCREEN_RENDER_CRASH',
        module: DEFAULT_CRASH_LOG_MODULE,
        step: 'Inicio',
        context: expect.objectContaining({ screen: 'Inicio' }),
      })
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('con Sentry configurado también lo envía allí, con la pantalla como etiqueta', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://clave@sentry.example/1';
    render(<ScreenErrorBoundary screen="Entradas" logModule="entries"><Boom /></ScreenErrorBoundary>);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { screen: 'Entradas' } })
    );
    expect(logOperationError).toHaveBeenCalledWith(expect.objectContaining({ module: 'entries' }));
  });
});
