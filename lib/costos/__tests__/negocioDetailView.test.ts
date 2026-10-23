import { costAlertAccessFor, costAlertRoute, negocioDetailViewFor } from '../access';

/**
 * Regla (2026-10-23): el detalle del negocio nunca muestra costos. El aviso de
 * venta bajo costo tiene su propia pantalla; `/negocio/[id]` solo cae a la
 * vista de costos para quien no tiene otro perfil o con un enlace viejo
 * `?view=costos`.
 */
describe('negocioDetailViewFor', () => {
  it('solo costos: siempre la vista de costos', () => {
    expect(negocioDetailViewFor(['costos'])).toBe('costos');
  });

  it('costos + otro rol: detalle completo (sin costos)', () => {
    expect(negocioDetailViewFor(['admin', 'costos'])).toBe('completo');
    expect(negocioDetailViewFor(['vendedor', 'Costos'])).toBe('completo');
  });

  it('enlace viejo ?view=costos: vista de costos solo con el perfil', () => {
    expect(negocioDetailViewFor(['vendedor', 'costos'], { requestedView: 'costos' })).toBe('costos');
    expect(negocioDetailViewFor(['vendedor'], { requestedView: 'costos' })).toBe('completo');
    expect(negocioDetailViewFor([], { requestedView: 'costos' })).toBe('completo');
  });
});

describe('costAlertRoute', () => {
  it('lleva a la pantalla propia del aviso', () => {
    expect(costAlertRoute('n-7')).toBe('/costos/aviso/n-7');
    expect(costAlertRoute('a b')).toBe('/costos/aviso/a%20b');
  });
});

describe('costAlertAccessFor', () => {
  it('con el perfil costos entra, tenga o no otro rol', () => {
    expect(costAlertAccessFor(['costos'], { rolesLoading: false })).toBe('permitido');
    expect(costAlertAccessFor(['admin', 'Costos'], { rolesLoading: true })).toBe('permitido');
  });

  it('sin el perfil: espera a que carguen los perfiles y luego niega', () => {
    expect(costAlertAccessFor([], { rolesLoading: true })).toBe('cargando');
    expect(costAlertAccessFor(['admin'], { rolesLoading: false })).toBe('sin_acceso');
  });
});
