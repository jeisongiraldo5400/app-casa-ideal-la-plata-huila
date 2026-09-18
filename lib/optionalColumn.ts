/**
 * Consultas que piden una columna que quizá todavía no exista en la base.
 *
 * Entre que se publica una versión de la app y se aplica su migración hay una
 * ventana en la que el `select` explícito de una columna nueva rompe la
 * consulta entera: PostgREST devuelve el error de Postgres `42703`
 * («column … does not exist»). En vez de dejar la pantalla en blanco, se
 * reintenta una sola vez sin la columna y se recuerda el resultado para no
 * gastar un viaje de más en cada consulta siguiente.
 */

/** `undefined_column` de Postgres; PostgREST lo reenvía tal cual en `code`. */
export const UNDEFINED_COLUMN_CODE = '42703';

/** ¿El error es «la columna no existe»? Sirve para errores lanzados y devueltos. */
export function isUndefinedColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === UNDEFINED_COLUMN_CODE) return true;
  return typeof message === 'string' && /column .*does not exist/i.test(message);
}

/** ¿El resultado de supabase-js trae un error de columna inexistente? */
function resultHasUndefinedColumn(result: unknown): boolean {
  if (!result || typeof result !== 'object' || !('error' in result)) return false;
  return isUndefinedColumnError((result as { error: unknown }).error);
}

export interface OptionalColumnGate {
  /** `false` en cuanto la base demuestra que la columna todavía no existe. */
  readonly available: boolean;
  /**
   * Corre `attempt(true)` y, si la base no tiene la columna, repite con
   * `attempt(false)`. Tolera tanto el error lanzado (p. ej. `fetchInChunks`)
   * como el devuelto en `{ error }` por supabase-js. Acepta `PromiseLike`
   * porque los constructores de consulta de supabase-js no son `Promise`.
   */
  run<T>(attempt: (withColumn: boolean) => PromiseLike<T>): Promise<T>;
  /** Solo para pruebas: vuelve a dar por buena la columna. */
  reset(): void;
}

export function createOptionalColumnGate(): OptionalColumnGate {
  let available = true;

  return {
    get available() {
      return available;
    },
    async run<T>(attempt: (withColumn: boolean) => PromiseLike<T>): Promise<T> {
      if (!available) return attempt(false);
      let result: T;
      try {
        result = await attempt(true);
      } catch (error: unknown) {
        if (!isUndefinedColumnError(error)) throw error;
        available = false;
        return attempt(false);
      }
      if (!resultHasUndefinedColumn(result)) return result;
      available = false;
      return attempt(false);
    },
    reset() {
      available = true;
    },
  };
}
