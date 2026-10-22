import { negocioDetailViewFor } from '../access';

/**
 * El aviso de venta bajo costo llega a TODO usuario con el perfil «costos».
 * Si además tiene otro rol que no deja leer ese negocio (vendedor de otro
 * negocio, bodeguero), al tocar el aviso el detalle completo fallaba con «No se
 * encontró el negocio»: debe caer a la vista de solo costo y margen.
 */
describe('negocioDetailViewFor', () => {
  it('solo costos: siempre la vista de costos', () => {
    expect(negocioDetailViewFor(['costos'], { negocioNotReadable: false })).toBe('costos');
  });

  it('costos + otro rol que no puede leer el negocio: vista de costos', () => {
    expect(negocioDetailViewFor(['vendedor', 'costos'], { negocioNotReadable: true })).toBe('costos');
    expect(negocioDetailViewFor(['bodeguero', 'Costos'], { negocioNotReadable: true })).toBe('costos');
  });

  it('costos + rol que sí lo lee: detalle completo', () => {
    expect(negocioDetailViewFor(['admin', 'costos'], { negocioNotReadable: false })).toBe('completo');
  });

  it('sin el perfil costos nunca ve la vista de costos', () => {
    expect(negocioDetailViewFor(['vendedor'], { negocioNotReadable: true })).toBe('completo');
    expect(negocioDetailViewFor([], { negocioNotReadable: true })).toBe('completo');
  });
});
