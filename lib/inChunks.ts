/**
 * Consultas PostgREST con filtros `.in(columna, ids)` partidas en lotes.
 *
 * PostgREST viaja el filtro `in.(…)` en la URL: con cientos o miles de UUID la
 * petición deja de caber (probado contra el proyecto: 400 ids ≈ 15 KB funcionan,
 * 1000 ids ≈ 37 KB devuelven 400 «Bad Request» y 2400 ids cortan la conexión).
 * Con lotes de 150 ids la URL queda por debajo de unos 6 KB.
 *
 * Además, Supabase limita cada respuesta a `max-rows` filas (1000 por defecto) sin
 * avisar. Las consultas que devuelven varias filas por id (salidas por orden, líneas
 * por orden…) deben pasar `pageSize` y ordenar por una columna única para leer cada
 * lote por páginas con `.range()`.
 */

/** Máximo de ids por petición: mantiene la URL por debajo de unos 6 KB con UUID. */
export const IN_FILTER_CHUNK_SIZE = 150;
/** Lotes simultáneos: no saturar la conexión del dispositivo ni el pool del servidor. */
export const IN_FILTER_CONCURRENCY = 3;
/** Filas por página; igual o menor que `max-rows` del proyecto (1000 por defecto). */
export const IN_FILTER_PAGE_SIZE = 1000;

type QueryResult<Row> = { data: Row[] | null; error: unknown };

/** Lo mínimo que se usa de un builder de supabase-js (es thenable y admite `.range`). */
export type ChunkQuery<Row> = PromiseLike<QueryResult<Row>> & {
  range: (from: number, to: number) => PromiseLike<QueryResult<Row>>;
};

export type InChunksOptions = {
  /** Ids por lote (por defecto 150). */
  chunkSize?: number;
  /** Lotes en paralelo (por defecto 3). */
  concurrency?: number;
  /**
   * Si se indica, cada lote se lee por páginas de este tamaño con `.range()` hasta
   * recibir una página incompleta. La consulta debe ordenar por una columna única.
   */
  pageSize?: number;
};

/** Parte `values` en lotes de `size` elementos conservando el orden. */
export function chunkArray<T>(values: readonly T[], size: number = IN_FILTER_CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('El tamaño de lote debe ser un entero positivo');
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/**
 * Ejecuta `buildQuery(lote)` por cada lote de ids (sin duplicados ni vacíos) con
 * concurrencia limitada y devuelve las filas unidas en el orden de los lotes.
 *
 * Los ids se deduplican: un id repetido en dos lotes duplicaría sus filas y, por
 * ejemplo, contaría dos veces las mismas salidas.
 *
 * Si un lote falla se lanza su error tal cual (el `PostgrestError` de supabase-js):
 * no se inician lotes nuevos y nunca se devuelven resultados parciales.
 */
export async function fetchInChunks<Id extends string | number, Row>(
  ids: readonly (Id | null | undefined)[],
  buildQuery: (chunk: Id[]) => ChunkQuery<Row>,
  options: InChunksOptions = {}
): Promise<Row[]> {
  const uniqueIds = [...new Set(ids.filter((id): id is Id => id !== null && id !== undefined && id !== ''))];
  if (uniqueIds.length === 0) return [];

  const chunks = chunkArray(uniqueIds, options.chunkSize ?? IN_FILTER_CHUNK_SIZE);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? IN_FILTER_CONCURRENCY, chunks.length));
  const pageSize = options.pageSize;
  if (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize < 1)) {
    throw new Error('El tamaño de página debe ser un entero positivo');
  }

  const results: Row[][] = new Array(chunks.length);
  let nextChunk = 0;
  let failure: { error: unknown } | null = null;

  const runChunk = async (chunk: Id[]): Promise<Row[]> => {
    if (pageSize === undefined) {
      const { data, error } = await buildQuery(chunk);
      if (error) throw error;
      return data || [];
    }
    const rows: Row[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery(chunk).range(from, from + pageSize - 1);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  };

  const worker = async () => {
    while (!failure && nextChunk < chunks.length) {
      const index = nextChunk++;
      try {
        results[index] = await runChunk(chunks[index]);
      } catch (error) {
        failure ??= { error };
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  if (failure) throw (failure as { error: unknown }).error;
  return results.flat();
}
