import {
  downloadSalePrices,
  forgetSalePrices,
  normalizeSalePrice,
  parseSalePriceRows,
  parseStoredSalePrices,
  readLocalSalePrice,
  readLocalSalePrices,
  SALE_PRICES_META_KEY,
} from '../salePrices';

const mockMeta = new Map<string, string>();
jest.mock('../outbox', () => ({
  getMeta: jest.fn(async (_db: unknown, key: string) => mockMeta.get(key) ?? null),
  setMeta: jest.fn(async (_db: unknown, key: string, value: string) => {
    mockMeta.set(key, value);
  }),
}));

const db = {} as never;

describe('precios de venta guardados en el teléfono (modo sin señal)', () => {
  beforeEach(() => mockMeta.clear());

  it('normaliza a pesos enteros y descarta lo inválido', () => {
    expect(normalizeSalePrice(1890000)).toBe(1890000);
    expect(normalizeSalePrice('1890000.40')).toBe(1890000);
    expect(normalizeSalePrice(0)).toBeNull();
    expect(normalizeSalePrice(-5)).toBeNull();
    expect(normalizeSalePrice('abc')).toBeNull();
    expect(normalizeSalePrice(null)).toBeNull();
  });

  it('lee solo product_id y price de las filas del servidor', () => {
    expect(
      parseSalePriceRows([
        { product_id: 'p1', price: 150000 },
        { product_id: 'p2', price: '89900.00' },
        { product_id: '', price: 1 },
        { price: 5 },
        null,
      ])
    ).toEqual({ p1: 150000, p2: 89900 });
    expect(parseSalePriceRows(null)).toEqual({});
  });

  it('lo guardado dañado se trata como vacío', () => {
    expect(parseStoredSalePrices('{no es json')).toEqual({});
    expect(parseStoredSalePrices('[1,2]')).toEqual({});
    expect(parseStoredSalePrices(null)).toEqual({});
  });

  it('«Descargar» pide la lista completa y la reemplaza entera', async () => {
    mockMeta.set(SALE_PRICES_META_KEY, JSON.stringify({ viejo: 1000 }));
    const rpc = jest.fn(async () => ({ data: [{ product_id: 'p1', price: 150000 }], error: null }));

    await expect(downloadSalePrices(db, rpc)).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith('get_product_sale_prices', { p_product_ids: null });
    expect(await readLocalSalePrices(db)).toEqual({ p1: 150000 });
    expect(await readLocalSalePrice(db, 'p1')).toBe(150000);
    expect(await readLocalSalePrice(db, 'viejo')).toBeNull();
  });

  it('si el servidor falla (o no tiene la función) se conserva la lista anterior', async () => {
    mockMeta.set(SALE_PRICES_META_KEY, JSON.stringify({ p1: 150000 }));
    const failing = jest.fn(async () => ({ data: null, error: { message: 'function does not exist' } }));
    await expect(downloadSalePrices(db, failing)).resolves.toBe(false);
    const throwing = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(downloadSalePrices(db, throwing)).resolves.toBe(false);
    expect(await readLocalSalePrice(db, 'p1')).toBe(150000);
  });

  it('con productos en «ninguno» se olvidan', async () => {
    mockMeta.set(SALE_PRICES_META_KEY, JSON.stringify({ p1: 150000 }));
    await forgetSalePrices(db);
    expect(await readLocalSalePrices(db)).toEqual({});
  });
});
