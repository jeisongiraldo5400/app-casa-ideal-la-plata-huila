import type { PullOptions } from './types';

/**
 * Llamada a `pull_mobile_sync` con los reintentos de compatibilidad.
 *
 * PostgREST resuelve la función por los nombres de sus argumentos: un servidor
 * que no conoce un parámetro contesta PGRST202 en vez de ignorarlo. Se va
 * quitando lo nuevo de a uno para no dejar el teléfono sin descargar nada:
 *
 *   1. con `p_options` (descarga selectiva, 20261130140000) y, si toca, con
 *      `p_include_catalog` (20261122120000);
 *   2. sin `p_options`: el servidor no hace descarga selectiva;
 *   3. sin catálogo: el servidor tampoco conoce el tercer parámetro.
 */
export type PullRpc = (
  fn: 'pull_mobile_sync',
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: unknown }>;

export type PullRequestInput = {
  /** Cursor general (ya ajustado a la versión del paquete). */
  lastPulledAt: string | null;
  /** Cursor con el que se pide el paquete cuando incluye el catálogo. */
  catalogCursor: string | null;
  includeCatalog: boolean;
  limit: number;
  /** `null` = no se envía `p_options` (servidor conocido como antiguo). */
  options: PullOptions | null;
};

export type PullRequestResult = {
  data: unknown;
  error: unknown;
  /**
   * 'supported': el servidor aceptó `p_options`.
   * 'unsupported': lo rechazó por no conocerlo y el reintento sin él funcionó.
   * 'unknown': no se envió, o falló por otra causa.
   */
  selective: 'supported' | 'unsupported' | 'unknown';
};

function errorRecord(error: unknown) {
  return (error || {}) as { code?: unknown; message?: unknown };
}

/** ¿El servidor no conoce `p_include_catalog`? (20261122120000) */
export function isMissingCatalogParamError(error: unknown): boolean {
  const record = errorRecord(error);
  if (String(record.code || '') === 'PGRST202') return true;
  return /p_include_catalog|could not find the function|does not exist/i.test(
    String(record.message || '')
  );
}

/** ¿El servidor no conoce `p_options`? (20261130140000) */
export function isMissingOptionsParamError(error: unknown): boolean {
  const record = errorRecord(error);
  if (String(record.code || '') === 'PGRST202') return true;
  return /p_options|could not find the function/i.test(String(record.message || ''));
}

export async function requestPull(rpc: PullRpc, input: PullRequestInput): Promise<PullRequestResult> {
  const baseArgs = {
    p_last_pulled_at: input.includeCatalog ? input.catalogCursor : input.lastPulledAt,
    p_limit: input.limit,
    ...(input.includeCatalog ? { p_include_catalog: true } : {}),
  };
  let selective: PullRequestResult['selective'] = 'unknown';
  let { data, error } = await rpc('pull_mobile_sync', {
    ...baseArgs,
    ...(input.options ? { p_options: input.options } : {}),
  });
  if (!error && input.options) selective = 'supported';

  let optionsRejected = false;
  if (error && input.options && isMissingOptionsParamError(error)) {
    optionsRejected = true;
    ({ data, error } = await rpc('pull_mobile_sync', baseArgs));
  }
  if (error && input.includeCatalog && isMissingCatalogParamError(error)) {
    // Servidor anterior a 20261122120000: no conoce el tercer parámetro. Se
    // sincroniza sin catálogo en vez de dejar el teléfono sin descargar nada.
    ({ data, error } = await rpc('pull_mobile_sync', {
      p_last_pulled_at: input.lastPulledAt,
      p_limit: input.limit,
    }));
  }
  // Sólo se da por «no soportado» si sin `p_options` el servidor sí contestó:
  // un error cualquiera no debe esconder los ajustes para siempre.
  if (optionsRejected && !error) selective = 'unsupported';
  return { data, error, selective };
}
