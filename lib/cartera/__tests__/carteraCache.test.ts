import {
  CARTERA_CACHE_TTL_MS,
  carteraFiltersKey,
  getCarteraStamp,
  invalidateCartera,
  markCarteraLoaded,
  needsCarteraRefresh,
  resetCarteraCache,
} from '../carteraCache';
import type { CarteraQuery } from '../types';

const filters: CarteraQuery = {
  filter: 'todas',
  search: '',
  days: 15,
  municipioId: '',
};

describe('carteraFiltersKey', () => {
  it('iguala filtros equivalentes e distingue los que cambian la consulta', () => {
    expect(carteraFiltersKey(filters)).toBe(carteraFiltersKey({ ...filters, sellerId: '' }));
    expect(carteraFiltersKey({ ...filters, sellerId: 'v1' })).not.toBe(carteraFiltersKey(filters));
    expect(carteraFiltersKey({ ...filters, dueFrom: '2026-09-01' })).not.toBe(
      carteraFiltersKey(filters)
    );
  });
});

describe('needsCarteraRefresh', () => {
  const now = 1_000_000;
  const key = carteraFiltersKey(filters);

  it('recarga la primera vez', () => {
    expect(needsCarteraRefresh(null, key, now)).toBe(true);
  });

  it('reutiliza lo cargado durante la ventana de frescura', () => {
    expect(
      needsCarteraRefresh({ loadedAt: now - CARTERA_CACHE_TTL_MS, key, stale: false }, key, now)
    ).toBe(false);
    expect(
      needsCarteraRefresh({ loadedAt: now - CARTERA_CACHE_TTL_MS - 1, key, stale: false }, key, now)
    ).toBe(true);
  });

  it('recarga si cambian los filtros', () => {
    const otherKey = carteraFiltersKey({ ...filters, filter: 'mora' });
    expect(needsCarteraRefresh({ loadedAt: now, key, stale: false }, otherKey, now)).toBe(true);
  });

  it('recarga tras invalidar aunque sea reciente', () => {
    expect(needsCarteraRefresh({ loadedAt: now, key, stale: true }, key, now)).toBe(true);
  });
});

describe('marca de sesión', () => {
  beforeEach(() => resetCarteraCache());

  it('guarda la carga y la invalida al abrir un negocio', () => {
    const key = carteraFiltersKey(filters);
    expect(getCarteraStamp()).toBeNull();

    markCarteraLoaded(key, 500);
    expect(getCarteraStamp()).toEqual({ loadedAt: 500, key, stale: false });
    expect(needsCarteraRefresh(getCarteraStamp(), key, 600)).toBe(false);

    invalidateCartera();
    expect(needsCarteraRefresh(getCarteraStamp(), key, 600)).toBe(true);
  });
});
