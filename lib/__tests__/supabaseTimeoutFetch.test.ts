/**
 * Señal débil: `fetch` puede quedarse colgado y la app girar sin caer nunca al
 * camino sin conexión. El cliente de Supabase corta la petición y devuelve un
 * error que el resto de la app entiende como falta de red. Las subidas a
 * Storage (soportes, firmas) quedan fuera del corte: son lentas por naturaleza.
 */
// El cliente real deja temporizadores vivos (refresco de sesión) y aquí solo
// se prueba el `fetch` con tiempo límite.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {} })),
}));

import { createTimeoutFetch, REQUEST_TIMEOUT_MESSAGE } from '../supabase';
import { isNetworkError } from '../offline/security/sessionPolicy';
import { classifyPushError } from '../offline/sync/retryPolicy';

const RPC_URL = 'https://test.supabase.co/rest/v1/rpc/register_negocio_pago';
const STORAGE_URL = 'https://test.supabase.co/storage/v1/object/pago-supports/foto.jpg';

/** `fetch` que solo responde cuando se le pide; si lo abortan, rechaza. */
function hangingFetch() {
  const calls: { url: string; signal?: AbortSignal | null }[] = [];
  const fetchMock = jest.fn((input: any, init?: RequestInit) => {
    const signal = init?.signal;
    calls.push({ url: String(input), signal });
    return new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
      (fetchMock as any).resolveLast = () => resolve({ ok: true } as Response);
    });
  });
  return { fetchMock: fetchMock as unknown as typeof fetch, calls, mock: fetchMock };
}

describe('createTimeoutFetch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('corta la petición al vencer el tiempo límite y lo reporta como falta de red', async () => {
    const { fetchMock } = hangingFetch();
    const timeoutFetch = createTimeoutFetch(fetchMock, 8_000);

    const pending = timeoutFetch(RPC_URL);
    const asserted = expect(pending).rejects.toThrow(REQUEST_TIMEOUT_MESSAGE);
    jest.advanceTimersByTime(8_000);
    await asserted;

    // Con este mensaje la app guarda sin conexión y la cola no gasta intentos.
    expect(isNetworkError(new Error(REQUEST_TIMEOUT_MESSAGE))).toBe(true);
    expect(classifyPushError(REQUEST_TIMEOUT_MESSAGE)).toBe('network');
  });

  it('no corta las subidas a Storage, que pueden tardar más', async () => {
    const { fetchMock, mock } = hangingFetch();
    const timeoutFetch = createTimeoutFetch(fetchMock, 8_000);

    const pending = timeoutFetch(STORAGE_URL, { method: 'POST' });
    jest.advanceTimersByTime(60_000);
    (mock as any).resolveLast();

    await expect(pending).resolves.toMatchObject({ ok: true });
    // Una petición sin tiempo límite viaja sin señal de aborto propia.
    expect(mock.mock.calls[0][1]?.signal).toBeUndefined();
  });

  it('una respuesta a tiempo no se ve afectada', async () => {
    const baseFetch = jest.fn(async () => ({ ok: true }) as Response) as unknown as typeof fetch;
    await expect(createTimeoutFetch(baseFetch, 8_000)(RPC_URL)).resolves.toMatchObject({ ok: true });
  });

  it('un aborto pedido por quien llama no se disfraza de tiempo agotado', async () => {
    const { fetchMock } = hangingFetch();
    const controller = new AbortController();
    const pending = createTimeoutFetch(fetchMock, 8_000)(RPC_URL, { signal: controller.signal });
    const asserted = expect(pending).rejects.toThrow('Aborted');
    controller.abort();
    await asserted;
  });
});
