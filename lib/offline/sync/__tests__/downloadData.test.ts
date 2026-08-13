import NetInfo from '@react-native-community/netinfo';
import { requestManualDownload } from '../downloadData';
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
