// Receta del token de un enlace privado, idéntica a la del web:
// `randomBytes(32).toString('base64url')` → sha256 hex → pista = últimos 6.
// El RPC `create_private_catalog_share_link` valida estos formatos y que la
// pista sea sufijo del token.

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url sin relleno (`=`), como `Buffer.toString('base64url')`. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index];
    const byte2 = index + 1 < bytes.length ? bytes[index + 1] : undefined;
    const byte3 = index + 2 < bytes.length ? bytes[index + 2] : undefined;

    output += BASE64URL_ALPHABET[byte1 >> 2];
    output += BASE64URL_ALPHABET[((byte1 & 0x03) << 4) | ((byte2 ?? 0) >> 4)];
    if (byte2 === undefined) break;
    output += BASE64URL_ALPHABET[((byte2 & 0x0f) << 2) | ((byte3 ?? 0) >> 6)];
    if (byte3 === undefined) break;
    output += BASE64URL_ALPHABET[byte3 & 0x3f];
  }
  return output;
}

export const SHARE_TOKEN_HINT_LENGTH = 6;

export function shareTokenHint(token: string): string {
  return token.slice(-SHARE_TOKEN_HINT_LENGTH);
}

export function isValidShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
