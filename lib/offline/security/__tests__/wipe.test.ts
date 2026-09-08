import { clearCachedActiveRoute } from '@/lib/collection-routes/routeCache';
import { closeDatabase, isDatabaseOpen, resetDatabase } from '../../database';
import { clearLocalPagoSupportFiles } from '../localFiles';
import { clearOfflineSecureData } from '../secureKeys';
import { wipeLocalOfflineData } from '../wipe';

jest.mock('../../database', () => ({
  isDatabaseOpen: jest.fn(),
  resetDatabase: jest.fn(),
  closeDatabase: jest.fn(),
}));
jest.mock('@/lib/collection-routes/routeCache', () => ({
  clearCachedActiveRoute: jest.fn(),
}));
jest.mock('../localFiles', () => ({
  clearLocalPagoSupportFiles: jest.fn(),
}));
jest.mock('../secureKeys', () => ({
  clearOfflineSecureData: jest.fn(),
}));

describe('wipeLocalOfflineData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (isDatabaseOpen as jest.Mock).mockReturnValue(true);
    (resetDatabase as jest.Mock).mockResolvedValue(undefined);
    (closeDatabase as jest.Mock).mockResolvedValue(undefined);
    (clearCachedActiveRoute as jest.Mock).mockResolvedValue(undefined);
    (clearLocalPagoSupportFiles as jest.Mock).mockResolvedValue(undefined);
    (clearOfflineSecureData as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('elimina base, ruta activa, claves y soportes locales', async () => {
    await wipeLocalOfflineData();

    expect(resetDatabase).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(clearCachedActiveRoute).toHaveBeenCalledTimes(1);
    expect(clearLocalPagoSupportFiles).toHaveBeenCalledTimes(1);
    expect(clearOfflineSecureData).toHaveBeenCalledTimes(1);
  });

  it('continúa el cierre aunque falle una limpieza secundaria', async () => {
    (clearCachedActiveRoute as jest.Mock).mockRejectedValue(new Error('storage error'));
    await expect(wipeLocalOfflineData()).resolves.toBeUndefined();
    expect(clearOfflineSecureData).toHaveBeenCalledTimes(1);
  });
});
