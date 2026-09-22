import { isDuplicateCustomerIdNumber } from '../customersService';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

describe('isDuplicateCustomerIdNumber', () => {
  // El error real que vio el usuario al crear un cliente desde Nuevo negocio.
  it('reconoce el documento repetido tal como lo devuelve la base', () => {
    expect(
      isDuplicateCustomerIdNumber({
        code: '23505',
        message: 'duplicate key value violates unique constraint "customers_id_number_key"',
        details: 'Key (id_number)=(55212681) already exists.',
      })
    ).toBe(true);
  });

  it('no confunde otras restricciones únicas', () => {
    expect(
      isDuplicateCustomerIdNumber({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_email_key"' })
    ).toBe(false);
  });

  it('no confunde otros errores ni valores vacíos', () => {
    expect(isDuplicateCustomerIdNumber({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isDuplicateCustomerIdNumber(new Error('Network request failed'))).toBe(false);
    expect(isDuplicateCustomerIdNumber(null)).toBe(false);
  });
});
