import * as Crypto from 'expo-crypto';
import { encodeBase64Url, isSha256Hex, isValidShareToken, shareTokenHint } from '@/lib/catalogos/token';

export type ShareToken = {
  token: string;
  tokenHash: string;
  tokenHint: string;
};

/**
 * Equivale a `randomBytes(32).toString('base64url')` + sha256 hex del web.
 * Única dependencia de `expo-crypto` del módulo.
 */
export async function generateShareToken(): Promise<ShareToken> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const token = encodeBase64Url(bytes);
  const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  const normalizedHash = tokenHash.toLowerCase();
  if (!isValidShareToken(token) || !isSha256Hex(normalizedHash)) {
    throw new Error('No fue posible generar un token válido para el enlace.');
  }
  return { token, tokenHash: normalizedHash, tokenHint: shareTokenHint(token) };
}
