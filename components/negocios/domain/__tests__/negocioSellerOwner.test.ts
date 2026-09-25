import {
  buildNegocioSellerInput,
  canAlignNegocioSellerWithOwner,
  negocioSellerBlockedReason,
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

  it('cliente sin dueño: el vendedor (no admin) se queda con el cliente, con y sin señal', () => {
    for (const online of [true, false]) {
      expect(
        negocioSellerMode({ hasCustomer: true, lookup: free, isAdmin: false, isVendedor: true, online })
      ).toBe('self-assign');
    }
    // Admin que además es vendedor: manda la regla del admin.
    expect(
      negocioSellerMode({ hasCustomer: true, lookup: free, isAdmin: true, isVendedor: true, online: true })
    ).toBe('admin-choose');
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

  it('sin señal el admin sabe que debe asignarlo con señal', () => {
    expect(negocioSellerOwnerHint('admin-offline')).toBe('Este cliente no tiene vendedor: asígnalo con señal');
    expect(negocioSellerOwnerHint('admin-choose')).toMatch(/Obligatorio.*quedará asignado/);
    expect(negocioSellerOwnerHint('self-assign')).toBe('El cliente quedará asignado a usted.');
  });

  it('vendedor que se queda con el cliente: rótulo con su nombre', () => {
    expect(
      negocioSellerOwnerText({ mode: 'self-assign', lookup: free, chosenSellerName: null, createdByName: 'Ana' })
    ).toBe('Ana (usted)');
  });
});

describe('negocioSellerBlockedReason', () => {
  it('admin con señal debe elegir; sin señal no puede guardar', () => {
    expect(negocioSellerBlockedReason({ mode: 'admin-choose', chosenSellerId: '' })).toMatch(/elija el vendedor/);
    expect(negocioSellerBlockedReason({ mode: 'admin-choose', chosenSellerId: 's1' })).toBeNull();
    expect(negocioSellerBlockedReason({ mode: 'admin-offline', chosenSellerId: '' })).toBe(
      'Este cliente no tiene vendedor: asígnalo con señal'
    );
  });

  it('los demás casos no bloquean', () => {
    for (const mode of ['owner', 'self-assign', 'unassigned', 'none'] as const) {
      expect(negocioSellerBlockedReason({ mode, chosenSellerId: '' })).toBeNull();
    }
  });
});

describe('buildNegocioSellerInput (vendedor sin dueño)', () => {
  it('pinta el negocio pendiente con quien registra y no manda la bandera', () => {
    const input = buildNegocioSellerInput({
      mode: 'self-assign',
      lookup: free,
      chosenSellerId: '',
      chosenSellerName: null,
      createdByName: 'Ana',
      userId: 'u1',
    });
    expect(input).toEqual({ local_seller_id: 'u1', seller_name: 'Ana' });
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
