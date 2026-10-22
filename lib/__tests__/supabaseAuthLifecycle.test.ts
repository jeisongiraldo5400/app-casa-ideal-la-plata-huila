jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {} })),
}));

import { shouldAutoRefreshSession } from '../supabase';
import { isOfflineError } from '../errorMessage';
import { REQUEST_TIMEOUT_MESSAGE } from '../supabase';

/**
 * Sin señal el temporizador de auth-js (cada 30 s) lanzaba un refresco con
 * reintentos que nunca llegaba y retenía el candado: las consultas esperaban
 * detrás de él antes de caer a lo guardado.
 */
describe('refresco automático de la sesión', () => {
  it('solo corre en primer plano y con señal', () => {
    expect(shouldAutoRefreshSession('active', true)).toBe(true);
    expect(shouldAutoRefreshSession('active', false)).toBe(false);
    expect(shouldAutoRefreshSession('background', true)).toBe(false);
  });
});

describe('isOfflineError', () => {
  it('reconoce el corte por tiempo del cliente («La red no respondió a tiempo.»)', () => {
    expect(isOfflineError(new Error(REQUEST_TIMEOUT_MESSAGE))).toBe(true);
    expect(isOfflineError({ message: REQUEST_TIMEOUT_MESSAGE })).toBe(true);
    expect(isOfflineError(new Error('permission denied'))).toBe(false);
  });
});
