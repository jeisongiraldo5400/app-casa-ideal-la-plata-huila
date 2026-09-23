import { PULL_CURSOR_OVERLAP_MS } from '@/lib/offline/sync/types';
import { lastSyncedAtFromCursor, useSyncStore } from '@/lib/offline/store/syncStore';

describe('lastSyncedAtFromCursor', () => {
  it('devuelve el instante del cursor más el solape con el que se guardó', () => {
    const cursor = '2026-09-23T12:00:00.000Z';
    expect(lastSyncedAtFromCursor(cursor)).toBe(Date.parse(cursor) + PULL_CURSOR_OVERLAP_MS);
  });

  it('sin cursor o con basura no inventa una hora', () => {
    expect(lastSyncedAtFromCursor(null)).toBeNull();
    expect(lastSyncedAtFromCursor('')).toBeNull();
    expect(lastSyncedAtFromCursor('no es una fecha')).toBeNull();
  });
});

describe('hydrateLastSyncedAt', () => {
  beforeEach(() => useSyncStore.setState({ lastSyncedAt: null }));

  it('al arrancar recupera la hora de la última descarga guardada en sync_meta', () => {
    useSyncStore.getState().hydrateLastSyncedAt('2026-09-23T12:00:00.000Z');
    expect(useSyncStore.getState().lastSyncedAt).toBe(
      Date.parse('2026-09-23T12:00:00.000Z') + PULL_CURSOR_OVERLAP_MS
    );
  });

  it('no pisa una sincronización de esta sesión, que es más reciente', () => {
    useSyncStore.setState({ lastSyncedAt: 1_700_000_000_000 });
    useSyncStore.getState().hydrateLastSyncedAt('2020-01-01T00:00:00.000Z');
    expect(useSyncStore.getState().lastSyncedAt).toBe(1_700_000_000_000);
  });
});
