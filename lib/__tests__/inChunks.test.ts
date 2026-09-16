import { chunkArray, fetchInChunks, IN_FILTER_CHUNK_SIZE, type ChunkQuery } from '../inChunks';

const ids = (count: number, prefix = 'id') => Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(5, '0')}`);

/** Consulta falsa: thenable con `.range`, que resuelve cuando el test la libera o de inmediato. */
function fakeQuery<Row>(rowsFor: (from?: number, to?: number) => { data: Row[] | null; error: unknown }): ChunkQuery<Row> {
  return {
    then: (resolve, reject) => Promise.resolve(rowsFor()).then(resolve, reject),
    range: (from, to) => Promise.resolve(rowsFor(from, to)),
  };
}

describe('chunkArray', () => {
  it('parte en lotes del tamaño pedido conservando el orden', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 2)).toEqual([]);
  });

  it('usa 150 por defecto', () => {
    const chunks = chunkArray(ids(1000));
    expect(IN_FILTER_CHUNK_SIZE).toBe(150);
    expect(chunks).toHaveLength(7);
    expect(chunks.every((chunk) => chunk.length <= 150)).toBe(true);
    expect(chunks.flat()).toEqual(ids(1000));
  });

  it('rechaza tamaños inválidos', () => {
    expect(() => chunkArray([1], 0)).toThrow();
  });
});

describe('fetchInChunks', () => {
  it('sin ids no consulta', async () => {
    const build = jest.fn();
    await expect(fetchInChunks([], build)).resolves.toEqual([]);
    await expect(fetchInChunks([null, undefined, ''], build)).resolves.toEqual([]);
    expect(build).not.toHaveBeenCalled();
  });

  it('con 2367 ids hace lotes de 150 como máximo y une las filas en el orden de los ids', async () => {
    const all = ids(2367);
    const seen: string[][] = [];
    const rows = await fetchInChunks(all, (chunk) => {
      seen.push(chunk);
      return fakeQuery(() => ({ data: chunk.map((id) => ({ id })), error: null }));
    });

    expect(seen).toHaveLength(Math.ceil(2367 / 150));
    expect(seen.every((chunk) => chunk.length <= 150)).toBe(true);
    expect(rows.map((row) => row.id)).toEqual(all);
  });

  it('conserva el orden de los lotes aunque terminen en otro orden', async () => {
    const all = ids(5);
    const rows = await fetchInChunks<string, { id: string }>(
      all,
      (chunk) => ({
        then: (resolve, reject) =>
          new Promise<{ data: { id: string }[]; error: null }>((done) =>
            // El primer lote tarda más que los siguientes.
            setTimeout(() => done({ data: chunk.map((id) => ({ id })), error: null }), chunk[0] === all[0] ? 20 : 1)
          ).then(resolve, reject),
        range: jest.fn(),
      }),
      { chunkSize: 2, concurrency: 3 }
    );
    expect(rows.map((row) => row.id)).toEqual(all);
  });

  it('deduplica los ids para no duplicar filas entre lotes', async () => {
    const seen: string[][] = [];
    const rows = await fetchInChunks(['a', 'b', 'a', 'c', 'b'], (chunk) => {
      seen.push(chunk);
      return fakeQuery(() => ({ data: chunk.map((id) => ({ id })), error: null }));
    }, { chunkSize: 2 });
    expect(seen).toEqual([['a', 'b'], ['c']]);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('no supera la concurrencia indicada', async () => {
    let active = 0;
    let peak = 0;
    await fetchInChunks(ids(20), (chunk) => ({
      then: (resolve, reject) => {
        active += 1;
        peak = Math.max(peak, active);
        return new Promise<{ data: string[]; error: null }>((done) =>
          setTimeout(() => {
            active -= 1;
            done({ data: chunk, error: null });
          }, 2)
        ).then(resolve, reject);
      },
      range: jest.fn(),
    }), { chunkSize: 2, concurrency: 3 });
    expect(peak).toBe(3);
  });

  it('si un lote falla lanza su error, sin resultados parciales ni lotes nuevos', async () => {
    const badRequest = { message: 'Bad Request', code: '400' };
    const seen: string[][] = [];
    const promise = fetchInChunks(ids(10), (chunk) => {
      seen.push(chunk);
      return fakeQuery(() => (seen.length === 1 ? { data: null, error: badRequest } : { data: chunk, error: null }));
    }, { chunkSize: 2, concurrency: 1 });

    await expect(promise).rejects.toBe(badRequest);
    expect(seen).toHaveLength(1);
  });

  it('también lanza si la promesa del lote se rechaza (red caída)', async () => {
    await expect(
      fetchInChunks(ids(3), () => ({
        then: (resolve, reject) => Promise.reject(new TypeError('Network request failed')).then(resolve, reject),
        range: jest.fn(),
      }))
    ).rejects.toThrow('Network request failed');
  });

  it('con pageSize lee cada lote por páginas hasta una incompleta', async () => {
    // 1 id con 2500 filas: max-rows cortaría en 1000 sin paginar.
    const table = Array.from({ length: 2500 }, (_, i) => ({ n: i }));
    const ranges: [number, number][] = [];
    const rows = await fetchInChunks(['orden-1'], () =>
      fakeQuery((from = 0, to = 999) => {
        ranges.push([from, to]);
        return { data: table.slice(from, to + 1), error: null };
      }), { pageSize: 1000 });

    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(rows).toHaveLength(2500);
  });

  it('con pageSize propaga el error de una página', async () => {
    const error = { message: 'timeout' };
    await expect(
      fetchInChunks(['a'], () => fakeQuery((from = 0) => (from === 0 ? { data: new Array(10).fill({}), error: null } : { data: null, error })), { pageSize: 10 })
    ).rejects.toBe(error);
  });
});
