import { act, renderHook, waitFor } from '@testing-library/react-native';
import { loadShareLinkHours, saveShareLinkHours } from '../../../utils/shareLinkPreferences';
import { resetShareLinkHoursForTests, useShareLinkHours } from '../useShareLinkHours';

jest.mock('../../../utils/shareLinkPreferences', () => ({
  loadShareLinkHours: jest.fn(),
  saveShareLinkHours: jest.fn(async () => undefined),
}));

const mockedLoad = loadShareLinkHours as jest.MockedFunction<typeof loadShareLinkHours>;

beforeEach(() => {
  jest.clearAllMocks();
  resetShareLinkHoursForTests();
});

describe('useShareLinkHours', () => {
  it('lee la vigencia guardada una sola vez aunque haya varios formularios', async () => {
    mockedLoad.mockResolvedValue(24);
    const first = renderHook(() => useShareLinkHours());
    const second = renderHook(() => useShareLinkHours());

    await waitFor(() => expect(first.result.current[0]).toBe('24'));
    expect(second.result.current[0]).toBe('24');
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('«Nuevo enlace» y «Reemitir» comparten la vigencia elegida', async () => {
    mockedLoad.mockResolvedValue(168);
    const create = renderHook(() => useShareLinkHours());
    const reissue = renderHook(() => useShareLinkHours());
    await waitFor(() => expect(create.result.current[0]).toBe('168'));

    act(() => create.result.current[1]('72'));

    expect(reissue.result.current[0]).toBe('72');
    expect(saveShareLinkHours).toHaveBeenCalledWith(72);
  });

  it('lo que llega del almacenamiento no pisa una elección hecha mientras se leía', async () => {
    let resolveStored: (value: number) => void = () => undefined;
    mockedLoad.mockImplementation(() => new Promise((resolve) => (resolveStored = resolve)));
    const { result } = renderHook(() => useShareLinkHours());

    act(() => result.current[1]('24'));
    await act(async () => {
      resolveStored(168);
    });

    expect(result.current[0]).toBe('24');
  });
});
