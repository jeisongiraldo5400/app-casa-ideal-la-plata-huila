import { CATALOG_CACHE_TTL_MS, needsRefresh } from '../cacheFreshness';

describe('needsRefresh', () => {
  const now = 1_000_000;

  it('recarga sin datos previos', () => {
    expect(needsRefresh(null, now)).toBe(true);
    expect(needsRefresh(undefined, now)).toBe(true);
  });

  it('reutiliza durante 30 s', () => {
    expect(needsRefresh({ loadedAt: now - CATALOG_CACHE_TTL_MS, stale: false }, now)).toBe(false);
    expect(needsRefresh({ loadedAt: now - CATALOG_CACHE_TTL_MS - 1, stale: false }, now)).toBe(true);
  });

  it('recarga tras una mutación aunque sea reciente', () => {
    expect(needsRefresh({ loadedAt: now, stale: true }, now)).toBe(true);
  });
});
