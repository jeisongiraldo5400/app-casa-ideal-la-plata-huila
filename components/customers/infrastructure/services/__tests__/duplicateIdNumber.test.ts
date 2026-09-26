import { supabase } from '@/lib/supabase';
import { DuplicateCustomerDocumentError } from '@/lib/customers/customerDocument';
import { findCustomerByIdNumber, isDuplicateCustomerIdNumber } from '../customersService';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

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

describe('documento escrito distinto (20261219120000)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reconoce el rechazo del trigger, del alta sin señal y del teléfono', () => {
    expect(
      isDuplicateCustomerIdNumber({ code: 'P0001', message: 'Ya existe un cliente con el documento 1234567 (Ana).' })
    ).toBe(true);
    expect(
      isDuplicateCustomerIdNumber({
        code: 'P0001',
        message: 'El documento 1234567 pertenece a Ana, que fue eliminado. Pide a un administrador que lo restaure.',
      })
    ).toBe(true);
    expect(
      isDuplicateCustomerIdNumber(new DuplicateCustomerDocumentError({ id: 'c1', name: 'Ana', id_number: '1', deleted: false }))
    ).toBe(true);
  });

  it('busca quién lo tiene comparando por letras y dígitos', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [{ id: 'c1', name: 'Ana', id_number: '1234567', deleted: false }],
      error: null,
    });
    await expect(findCustomerByIdNumber(' 1.234.567 ')).resolves.toEqual({
      id: 'c1',
      name: 'Ana',
      id_number: '1234567',
      deleted: false,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('find_customer_by_document', { p_id_number: '1.234.567' });
  });

  it('si el rechazo vino del teléfono no consulta al servidor', async () => {
    const existing = { id: 'c1', name: 'Ana', id_number: '1234567', deleted: false };
    await expect(findCustomerByIdNumber('1.234.567', new DuplicateCustomerDocumentError(existing))).resolves.toBe(existing);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('un servidor sin la función cae a la coincidencia exacta', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    const maybeSingle = jest.fn(async () => ({ data: { id: 'c9', name: 'Luis', id_number: '99', deleted_at: null }, error: null }));
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle }) }) }),
    });
    await expect(findCustomerByIdNumber('99')).resolves.toEqual({ id: 'c9', name: 'Luis', id_number: '99', deleted: false });
  });
});
