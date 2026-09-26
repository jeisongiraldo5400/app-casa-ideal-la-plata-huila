import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { discardWarning, SyncQueueModal } from '../SyncQueueModal';
import { SyncStatusBanner } from '../SyncStatusBanner';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  discardSyncQueueItem,
  dismissSyncQueueNotice,
  listSyncQueue,
  listSyncQueueDependents,
  retrySyncQueueItem,
  type SyncQueueEntry,
} from '@/lib/offline/repositories/offlineRepository';

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  listSyncQueue: jest.fn(),
  listSyncQueueDependents: jest.fn(async () => []),
  retrySyncQueueItem: jest.fn(async () => ({ retried: true })),
  discardSyncQueueItem: jest.fn(async () => undefined),
  dismissSyncQueueNotice: jest.fn(async () => undefined),
}));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../infrastructure/syncPrefsService', () => ({
  isDownloadPending: () => false,
  loadSyncPrefs: jest.fn(),
  refreshDownloadState: jest.fn(),
  useSyncPrefsStore: Object.assign(
    (selector: (state: { lastManualAt: number | null }) => unknown) => selector({ lastManualAt: Date.now() }),
    { getState: () => ({ status: 'idle' }) }
  ),
}));

const entry = (overrides: Partial<SyncQueueEntry>): SyncQueueEntry => ({
  id: 'o1',
  type: 'create_customer',
  status: 'failed',
  attempts: 1,
  lastError: null,
  queuedAt: Date.now(),
  nextRetryAt: Date.now(),
  summary: 'Ana Pérez · doc. 123',
  ...overrides,
});

describe('SyncQueueModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useSyncStore.setState({
      queueVisible: true,
      pendingCount: 0,
      failedCount: 1,
      noticeCount: 0,
      status: 'idle',
      online: true,
      userId: 'u1',
    });
  });

  it('muestra el error traducido y botones accesibles', async () => {
    (listSyncQueue as jest.Mock).mockResolvedValue([
      entry({ type: 'register_pago', summary: '$ 50.000 · negocio 20260001', lastError: 'JWT expired' }),
    ]);
    const screen = render(<SyncQueueModal />);

    expect(await screen.findByText('La sesión expiró. Vuelva a iniciar sesión para enviar los cambios.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar Pago, $ 50.000 · negocio 20260001' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descartar Pago, $ 50.000 · negocio 20260001' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sincronizar ahora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar la lista de cambios sin sincronizar' })).toBeTruthy();
  });

  it('descartar un cliente avisa cuántos negocios dependen y los descarta juntos', async () => {
    (listSyncQueue as jest.Mock).mockResolvedValue([entry({})]);
    (listSyncQueueDependents as jest.Mock).mockResolvedValue([
      { outboxId: 'n1', negocioId: 'neg-1', customerName: 'Ana Pérez', totalCredit: 900000 },
      { outboxId: 'n2', negocioId: 'neg-2', customerName: 'Ana Pérez', totalCredit: 100000 },
    ]);
    const screen = render(<SyncQueueModal />);

    fireEvent.press(await screen.findByRole('button', { name: 'Descartar Cliente nuevo, Ana Pérez · doc. 123' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Descartar cliente y sus negocios');
    expect(message).toMatch(/^Hay 2 negocios que dependen de este cliente/);
    expect(buttons.map((button: { text: string }) => button.text)).toEqual(['Cancelar', 'Descartar todo']);
    await act(async () => {
      await buttons[1].onPress();
    });
    expect(discardSyncQueueItem).toHaveBeenCalledWith('o1');
  });

  it('si no se puede reintentar, dice por qué', async () => {
    (listSyncQueue as jest.Mock).mockResolvedValue([entry({ type: 'create_negocio', summary: 'Ana · $ 900.000' })]);
    (retrySyncQueueItem as jest.Mock).mockResolvedValue({ retried: false, reason: 'Hay que volver a firmar: …' });
    const screen = render(<SyncQueueModal />);

    fireEvent.press(await screen.findByRole('button', { name: 'Reintentar Negocio nuevo, Ana · $ 900.000' }));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('No se puede reintentar', 'Hay que volver a firmar: …')
    );
  });

  it('un enviado con aviso se lee y se da por visto', async () => {
    (listSyncQueue as jest.Mock).mockResolvedValue([
      entry({
        type: 'create_negocio',
        status: 'done',
        summary: 'Ana · $ 900.000',
        lastError: 'El cliente Ana ya era de Carlos: el negocio quedó a su nombre.',
      }),
    ]);
    const screen = render(<SyncQueueModal />);

    expect(await screen.findByText('El cliente Ana ya era de Carlos: el negocio quedó a su nombre.')).toBeTruthy();
    expect(screen.queryByText('Descartar')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Entendido: ocultar el aviso de Negocio nuevo, Ana · $ 900.000' }));
    await waitFor(() => expect(dismissSyncQueueNotice).toHaveBeenCalledWith('o1'));
  });

  it('el aviso genérico se mantiene para lo que no tiene dependientes', () => {
    expect(discardWarning({ type: 'register_pago' }, 0)).toMatch(/^El cambio no se enviará/);
    expect(discardWarning({ type: 'create_customer' }, 1)).toMatch(/^Hay 1 negocio que depende/);
  });
});

describe('SyncStatusBanner', () => {
  it('es un botón accesible y avisa de lo enviado con aviso', () => {
    useSyncStore.setState({
      online: true,
      status: 'idle',
      pendingCount: 0,
      failedCount: 0,
      noticeCount: 1,
      lastError: null,
      lastSyncedAt: Date.now(),
      userId: 'u1',
    });
    const screen = render(<SyncStatusBanner />);

    const banner = screen.getByRole('button', { name: '1 aviso de sincronización · toca para ver' });
    expect(banner.props.accessibilityHint).toBe('Abre la lista de cambios sin sincronizar');
    fireEvent.press(banner);
    expect(useSyncStore.getState().queueVisible).toBe(true);
  });
});
