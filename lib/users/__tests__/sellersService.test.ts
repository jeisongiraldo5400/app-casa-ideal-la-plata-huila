import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchProfileNamesFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
import { fetchSellerOptions, withCurrentUserOption } from '../sellersService';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/offline/security/sessionPolicy', () => ({ isNetworkError: jest.fn(() => false) }));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: jest.fn(() => true),
  fetchProfileNamesFromLocal: jest.fn(),
}));

/** `profiles` se consulta con select/is/order/limit encadenados. */
function mockProfilesQuery(result: { data: unknown; error: unknown }) {
  const limit = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockReturnValue({ limit });
  const is = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ is });
  (supabase.from as jest.Mock).mockReturnValue({ select });
}

describe('fetchSellerOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isNetworkError as jest.Mock).mockReturnValue(false);
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
  });

  it('con red usa el nombre y cae al correo si no hay nombre', async () => {
    mockProfilesQuery({
      data: [
        { id: 'u1', full_name: 'Ana Vendedora', email: 'ana@correo.com' },
        { id: 'u2', full_name: null, email: 'beto@correo.com' },
      ],
      error: null,
    });

    await expect(fetchSellerOptions()).resolves.toEqual([
      { id: 'u1', full_name: 'Ana Vendedora' },
      { id: 'u2', full_name: 'beto@correo.com' },
    ]);
    expect(fetchProfileNamesFromLocal).not.toHaveBeenCalled();
  });

  /**
   * Antes devolvía [] sin red y eso dejaba vacíos el filtro de Clientes, los
   * dos filtros de Cartera y la reasignación de vendedor.
   */
  it('sin red responde con los perfiles descargados, en orden alfabético', async () => {
    mockProfilesQuery({ data: null, error: { message: 'Network request failed' } });
    (isNetworkError as jest.Mock).mockReturnValue(true);
    (fetchProfileNamesFromLocal as jest.Mock).mockResolvedValue(
      new Map([
        ['u2', 'Beto Gómez'],
        ['u1', 'Ana Vendedora'],
      ])
    );

    await expect(fetchSellerOptions()).resolves.toEqual([
      { id: 'u1', full_name: 'Ana Vendedora' },
      { id: 'u2', full_name: 'Beto Gómez' },
    ]);
  });

  it('sin red y sin base local devuelve la lista vacía de antes', async () => {
    mockProfilesQuery({ data: null, error: { message: 'Network request failed' } });
    (isNetworkError as jest.Mock).mockReturnValue(true);
    (canUseLocalDb as jest.Mock).mockReturnValue(false);

    await expect(fetchSellerOptions()).resolves.toEqual([]);
  });

  it('un error que no es de red se propaga', async () => {
    mockProfilesQuery({ data: null, error: { message: 'Sin permiso' } });

    await expect(fetchSellerOptions()).rejects.toThrow('Sin permiso');
  });
});

describe('withCurrentUserOption', () => {
  it('pone al usuario actual primero aunque no esté en la lista', () => {
    const options = withCurrentUserOption([{ id: 'u2', full_name: 'Beto' }], { id: 'u1', name: 'Ana' });
    expect(options.map((option) => option.id)).toEqual(['u1', 'u2']);
  });
});
