import * as Crypto from 'expo-crypto';
import { generateShareToken } from '../shareTokenService';

const mockedCrypto = Crypto as jest.Mocked<typeof Crypto>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedCrypto.getRandomBytesAsync.mockResolvedValue(Uint8Array.from({ length: 32 }, (_, index) => index * 7) as never);
  mockedCrypto.digestStringAsync.mockResolvedValue('a'.repeat(64) as never);
});

describe('generateShareToken', () => {
  it('produce token de 43 caracteres, hash sha256 y pista de 6, como espera el RPC', async () => {
    const result = await generateShareToken();

    expect(result.token).toHaveLength(43);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(result.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.tokenHint).toHaveLength(6);
    // El RPC valida `right(token, len(hint)) = hint`.
    expect(result.token.endsWith(result.tokenHint)).toBe(true);
  });

  it('pide 32 bytes aleatorios y hashea el token en hexadecimal', async () => {
    const result = await generateShareToken();
    expect(mockedCrypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
    expect(mockedCrypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', result.token, { encoding: 'hex' });
  });

  it('normaliza a minúsculas un hash en mayúsculas', async () => {
    mockedCrypto.digestStringAsync.mockResolvedValueOnce('A'.repeat(64) as never);
    await expect(generateShareToken()).resolves.toMatchObject({ tokenHash: 'a'.repeat(64) });
  });

  it('falla si el hash no tiene forma de sha256', async () => {
    mockedCrypto.digestStringAsync.mockResolvedValueOnce('corto' as never);
    await expect(generateShareToken()).rejects.toThrow('No fue posible generar un token válido');
  });
});
