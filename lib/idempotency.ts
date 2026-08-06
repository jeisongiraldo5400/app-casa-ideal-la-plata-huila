export function createIdempotencyKey(): string {
  const nativeCrypto = globalThis.crypto;
  if (nativeCrypto && typeof nativeCrypto.randomUUID === 'function') {
    return nativeCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
