import {
  buildNegocioSellerInput,
  canAlignNegocioSellerWithOwner,
  negocioSellerDiffersFromOwner,
  negocioSellerMode,
  negocioSellerOwnerHint,
  negocioSellerOwnerText,
} from '../negocioSellerOwner';

const owned = { status: 'assigned' as const, sellerId: 's-dueno', name: 'Beto Dueño' };
const free = { status: 'unassigned' as const };

describe('negocioSellerMode', () => {
  it('sin cliente o consultando', () => {
    expect(negocioSellerMode({ hasCustomer: false, lookup: owned, isAdmin: true, online: true })).toBe('none');
    expect(negocioSellerMode({ hasCustomer: true, lookup: null, isAdmin: true, online: true })).toBe('loading');
  });

  it('cliente con dueño: fijo para todos, con y sin señal', () => {
    for (const isAdmin of [true, false]) {
      for (const online of [true, false]) {
        expect(negocioSellerMode({ hasCustomer: true, lookup: owned, isAdmin, online })).toBe('owner');
      }
    }
  });

  it('cliente sin dueño: solo el admin con señal elige', () => {
    expect(negocioSellerMode({ hasCustomer: true, lookup: free, isAdmin: true, online: true })).toBe('admin-choose');
    expect(negocioSellerMode({ hasCustomer: true, lookup: free, isAdmin: true, online: false })).toBe('admin-offline');
    expect(negocioSellerMode({ hasCustomer: true, lookup: free, isAdmin: false, online: true })).toBe('unassigned');
  });

  it('dueño desconocido', () => {
    expect(
      negocioSellerMode({ hasCustomer: true, lookup: { status: 'unknown' }, isAdmin: true, online: false })
    ).toBe('unknown');
  });
});

describe('buildNegocioSellerInput', () => {
  const common = { chosenSellerId: '', chosenSellerName: null, createdByName: 'Ana Crea' };

  it('con dueño no envía seller_id (el servidor usa el dueño) y pinta al dueño', () => {
    expect(buildNegocioSellerInput({ ...common, mode: 'owner', lookup: owned })).toEqual({
      local_seller_id: 's-dueno',
      seller_name: 'Beto Dueño',
    });
  });

  it('admin elige vendedor para cliente sin dueño: envía la bandera', () => {
    expect(
      buildNegocioSellerInput({
        ...common,
        mode: 'admin-choose',
        lookup: free,
        chosenSellerId: 's-nuevo',
        chosenSellerName: 'Carla',
      })
    ).toEqual({
      seller_id: 's-nuevo',
      assign_customer_seller: true,
      local_seller_id: 's-nuevo',
      seller_name: 'Carla',
    });
  });

  it('admin que no elige, no admin o sin señal: nada de vendedor (legado del servidor)', () => {
    for (const mode of ['admin-choose', 'admin-offline', 'unassigned', 'unknown'] as const) {
      expect(buildNegocioSellerInput({ ...common, mode, lookup: free })).toEqual({
        local_seller_id: null,
        seller_name: 'Ana Crea',
      });
    }
  });
});

describe('textos', () => {
  it('rótulo del vendedor', () => {
    expect(negocioSellerOwnerText({ mode: 'owner', lookup: owned, chosenSellerName: null })).toBe('Beto Dueño');
    expect(negocioSellerOwnerText({ mode: 'unassigned', lookup: free, chosenSellerName: null })).toBe('Sin asignar');
    expect(negocioSellerOwnerText({ mode: 'none', lookup: null, chosenSellerName: null })).toBeNull();
  });

  it('sin señal el admin sabe que debe asignarlo desde Clientes', () => {
    expect(negocioSellerOwnerHint('admin-offline')).toMatch(/Clientes cuando haya señal/);
    expect(negocioSellerOwnerHint('admin-choose')).toMatch(/quedará asignado/);
  });
});

describe('vendedor guardado vs dueño', () => {
  it('detecta la diferencia', () => {
    expect(negocioSellerDiffersFromOwner('a', 'a')).toBe(false);
    expect(negocioSellerDiffersFromOwner('a', 'b')).toBe(true);
    expect(negocioSellerDiffersFromOwner('a', null)).toBe(true);
    expect(negocioSellerDiffersFromOwner(null, 'b')).toBe(false);
  });

  it('alinear: solo admin, con señal, cliente con dueño distinto y negocio vigente', () => {
    const base = { isAdmin: true, online: true, status: 'activo', negocioSellerId: 'a', customerSellerId: 'b' };
    expect(canAlignNegocioSellerWithOwner(base)).toBe(true);
    expect(canAlignNegocioSellerWithOwner({ ...base, isAdmin: false })).toBe(false);
    expect(canAlignNegocioSellerWithOwner({ ...base, online: false })).toBe(false);
    expect(canAlignNegocioSellerWithOwner({ ...base, status: 'anulado' })).toBe(false);
    expect(canAlignNegocioSellerWithOwner({ ...base, customerSellerId: null })).toBe(false);
    expect(canAlignNegocioSellerWithOwner({ ...base, customerSellerId: 'a' })).toBe(false);
  });
});
