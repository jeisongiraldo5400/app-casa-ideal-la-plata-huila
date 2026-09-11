import {
  autoAssignsCreatorAsSeller,
  customerCreateSubtitle,
  describeCreatedCustomer,
  expectedSellerIdOnCreate,
  roleNamesOf,
} from '../customerCreationAssignment';

describe('autoAssignsCreatorAsSeller / expectedSellerIdOnCreate', () => {
  it('solo vendedor: el cliente queda asignado a quien lo crea', () => {
    expect(autoAssignsCreatorAsSeller(['vendedor'])).toBe(true);
    expect(expectedSellerIdOnCreate('u1', ['Vendedor'])).toBe('u1');
  });

  it('administrador: no se autoasigna', () => {
    expect(autoAssignsCreatorAsSeller(['admin'])).toBe(false);
    expect(expectedSellerIdOnCreate('u1', ['admin'])).toBeNull();
  });

  it('administrador + vendedor (p. ej. Dario): no se autoasigna', () => {
    expect(autoAssignsCreatorAsSeller(['admin', 'vendedor'])).toBe(false);
    expect(expectedSellerIdOnCreate('u1', ['Vendedor', 'Admin'])).toBeNull();
  });

  it('gestor de cobro sin rol de vendedor: queda sin vendedor', () => {
    expect(expectedSellerIdOnCreate('u1', ['gestor de cobro'])).toBeNull();
  });

  it('gestor de cobro que además es vendedor: aplica la regla del vendedor', () => {
    expect(expectedSellerIdOnCreate('u1', ['gestor de cobro', 'vendedor'])).toBe('u1');
  });

  it('sin usuario no hay vendedor previsto', () => {
    expect(expectedSellerIdOnCreate(null, ['vendedor'])).toBeNull();
  });
});

describe('roleNamesOf', () => {
  it('normaliza los roles de useUserRoles e ignora los vacíos', () => {
    expect(
      roleNamesOf([
        { role: { nombre: ' Admin ' } },
        { role: { nombre: 'Vendedor' } },
        { role: null },
      ])
    ).toEqual(['admin', 'vendedor']);
    expect(roleNamesOf(null)).toEqual([]);
  });
});

describe('customerCreateSubtitle', () => {
  it('solo promete la asignación cuando va a ocurrir', () => {
    expect(customerCreateSubtitle(true)).toBe('Quedará asignado a ti');
    expect(customerCreateSubtitle(false)).toBe('Quedará sin vendedor asignado');
  });
});

describe('describeCreatedCustomer', () => {
  it('vendedor con red: dice que quedó asignado a él', () => {
    expect(
      describeCreatedCustomer({ name: 'Ana', sellerId: 'u1', currentUserId: 'u1', savedOffline: false })
    ).toBe('Ana quedó registrado y asignado a ti.');
  });

  it('admin con red: el servidor no asignó vendedor y el mensaje no lo afirma', () => {
    const message = describeCreatedCustomer({
      name: 'Ana',
      sellerId: null,
      currentUserId: 'admin-1',
      savedOffline: false,
    });
    expect(message).toBe('Ana quedó registrado sin vendedor asignado.');
    expect(message).not.toMatch(/asignado a ti/);
  });

  it('otro vendedor: no dice «asignado a ti»', () => {
    expect(
      describeCreatedCustomer({ name: 'Ana', sellerId: 'u2', currentUserId: 'u1', savedOffline: false })
    ).toBe('Ana quedó registrado.');
  });

  it('sin conexión, vendedor: avisa que se asignará al sincronizar', () => {
    expect(
      describeCreatedCustomer({ name: 'Ana', sellerId: 'u1', currentUserId: 'u1', savedOffline: true })
    ).toBe('Ana quedó guardado sin conexión. Quedará asignado a ti cuando se sincronice.');
  });

  it('sin conexión, admin: avisa que quedará sin vendedor', () => {
    expect(
      describeCreatedCustomer({ name: 'Ana', sellerId: null, currentUserId: 'u1', savedOffline: true })
    ).toBe('Ana quedó guardado sin conexión. Quedará sin vendedor asignado cuando se sincronice.');
  });
});
