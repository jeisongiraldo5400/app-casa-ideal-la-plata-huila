import { encodeBase64Url, isSha256Hex, isValidShareToken, shareTokenHint } from '../token';

function bytes(values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe('encodeBase64Url', () => {
  it('codifica como base64url sin relleno', () => {
    // "Man" → "TWFu" (vector clásico de RFC 4648).
    expect(encodeBase64Url(bytes([77, 97, 110]))).toBe('TWFu');
  });

  it('omite el relleno en longitudes no múltiplas de 3', () => {
    expect(encodeBase64Url(bytes([77]))).toBe('TQ');
    expect(encodeBase64Url(bytes([77, 97]))).toBe('TWE');
  });

  it('usa el alfabeto URL-safe (- y _ en vez de + y /)', () => {
    expect(encodeBase64Url(bytes([251, 255, 190]))).toBe('-_--');
  });

  it('32 bytes producen un token de 43 caracteres válido para el RPC', () => {
    const token = encodeBase64Url(Uint8Array.from({ length: 32 }, (_, index) => index * 7));
    expect(token).toHaveLength(43);
    expect(isValidShareToken(token)).toBe(true);
  });
});

describe('shareTokenHint', () => {
  it('es el sufijo de 6 caracteres, como exige el RPC', () => {
    const token = 'A'.repeat(37) + 'xyz789';
    expect(shareTokenHint(token)).toBe('xyz789');
    expect(token.endsWith(shareTokenHint(token))).toBe(true);
  });
});

describe('validaciones de formato', () => {
  it('rechaza tokens cortos o con caracteres no permitidos', () => {
    expect(isValidShareToken('corto')).toBe(false);
    expect(isValidShareToken('a'.repeat(31))).toBe(false);
    expect(isValidShareToken('a'.repeat(32))).toBe(true);
    expect(isValidShareToken(`${'a'.repeat(31)}+`)).toBe(false);
  });

  it('exige 64 hexadecimales en minúscula para el hash', () => {
    expect(isSha256Hex('a'.repeat(64))).toBe(true);
    expect(isSha256Hex('A'.repeat(64))).toBe(false);
    expect(isSha256Hex('a'.repeat(63))).toBe(false);
  });
});
