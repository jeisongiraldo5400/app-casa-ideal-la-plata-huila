import { customerEmailError, normalizeCustomerEmail } from '../customerEmail';

describe('customerEmail', () => {
  it.each(['', '   ', null, undefined])('vacío (%p) es válido: el correo es opcional', (value) => {
    expect(customerEmailError(value)).toBeNull();
  });

  it.each(['ana@correo.com', ' Ana.Perez@Correo.COM ', 'ana+pedidos@sub.dominio.co'])('%p es válido', (value) => {
    expect(customerEmailError(value)).toBeNull();
  });

  it.each(['ana', 'ana@', '@correo.com', 'ana@correo', 'ana perez@correo.com'])('%p no es válido', (value) => {
    expect(customerEmailError(value)).toBe('El correo electrónico no tiene un formato válido');
  });

  it('más de 255 caracteres no es válido', () => {
    expect(customerEmailError(`${'a'.repeat(250)}@correo.com`)).toBe(
      'El correo electrónico no puede exceder 255 caracteres'
    );
  });

  it('normaliza recortando y en minúsculas; vacío queda en null', () => {
    expect(normalizeCustomerEmail('  Ana@Correo.COM ')).toBe('ana@correo.com');
    expect(normalizeCustomerEmail('   ')).toBeNull();
    expect(normalizeCustomerEmail(null)).toBeNull();
  });
});
