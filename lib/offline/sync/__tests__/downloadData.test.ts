import NetInfo from '@react-native-community/netinfo';
import { catalogLagLabel, formatLastDownloadTime, requestManualDownload } from '../downloadData';
import { runSync } from '../syncEngine';
import { useSyncStore } from '../../store/syncStore';

jest.mock('../syncEngine', () => ({
  runSync: jest.fn(async () => undefined),
}));

const mockedRunSync = runSync as jest.MockedFunction<typeof runSync>;
const mockedFetch = NetInfo.fetch as jest.MockedFunction<typeof NetInfo.fetch>;

describe('requestManualDownload', () => {
  beforeEach(() => {
    mockedRunSync.mockClear();
    mockedFetch.mockReset();
    useSyncStore.setState({ lastError: null, status: 'idle', online: true });
  });

  it('no llama pull si no hay red', async () => {
    mockedFetch.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    } as never);

    const result = await requestManualDownload();

    expect(result).toEqual({ ok: false, reason: 'offline' });
    expect(mockedRunSync).not.toHaveBeenCalled();
  });

  it('llama runSync cuando hay internet', async () => {
    mockedFetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    } as never);

    const result = await requestManualDownload();

    expect(result).toEqual({ ok: true });
    expect(mockedRunSync).toHaveBeenCalledWith('manual');
  });
});

describe('formatLastDownloadTime', () => {
  const now = new Date(2026, 8, 25, 10, 12).getTime();

  it('hoy muestra solo la hora', () => {
    const label = formatLastDownloadTime(new Date(2026, 8, 25, 9, 5).getTime(), now);
    expect(label).not.toMatch(/ayer|sep/);
  });

  it('una descarga de ayer lo dice (antes parecía de hoy)', () => {
    expect(formatLastDownloadTime(new Date(2026, 8, 24, 12, 54).getTime(), now)).toMatch(/^ayer /);
  });

  it('más vieja lleva la fecha', () => {
    expect(formatLastDownloadTime(new Date(2026, 8, 20, 12, 54).getTime(), now)).toMatch(/^20 /);
  });
});

describe('catalogLagLabel', () => {
  const now = new Date(2026, 8, 25, 10, 20).getTime();
  const synced = new Date(2026, 8, 25, 10, 18).getTime();

  it('no avisa si el catálogo bajó en la misma sincronización', () => {
    expect(catalogLagLabel(synced, synced - 60_000, now)).toBeNull();
  });

  it('avisa cuando productos y existencias quedaron atrás', () => {
    expect(catalogLagLabel(synced, new Date(2026, 8, 24, 12, 54).getTime(), now)).toMatch(
      /^Productos y existencias · ayer /
    );
  });

  it('sin catálogo descargado no dice nada', () => {
    expect(catalogLagLabel(synced, null, now)).toBeNull();
  });
});
