import { businessSellerDiffers, carteraPeopleLines } from '../carteraPeople';

const base = {
  created_by: 'u-registra',
  created_by_name: 'Ana Registra',
  seller_id: 'u-registra',
  seller_name: 'Ana Registra',
  customer_seller_name: 'Beto Dueño',
};

describe('carteraPeopleLines', () => {
  it('caso reportado: registró y vendió Ana, pero el cliente es de Beto', () => {
    expect(carteraPeopleLines(base)).toEqual([
      { key: 'registered_by', label: 'Registrado por', value: 'Ana Registra' },
      { key: 'customer_seller', label: 'Vendedor del cliente', value: 'Beto Dueño' },
    ]);
  });

  it('cliente sin vendedor: lo dice en vez de dejarlo vacío', () => {
    const lines = carteraPeopleLines({ ...base, customer_seller_name: null });
    expect(lines.at(-1)).toEqual({
      key: 'customer_seller',
      label: 'Vendedor del cliente',
      value: 'Sin asignar',
    });
  });

  it('muestra el vendedor del negocio solo si es otra persona', () => {
    const lines = carteraPeopleLines({
      ...base,
      created_by: 'u-gestor',
      created_by_name: 'Gestor',
    });
    expect(lines.map((line) => `${line.label}: ${line.value}`)).toEqual([
      'Registrado por: Gestor',
      'Vendedor del negocio: Ana Registra',
      'Vendedor del cliente: Beto Dueño',
    ]);
  });

  it('negocio viejo sin quien lo registró: conserva el vendedor del negocio', () => {
    const lines = carteraPeopleLines({ ...base, created_by: null, created_by_name: null });
    expect(lines.map((line) => line.value)).toEqual(['—', 'Ana Registra', 'Beto Dueño']);
  });

  it('sin ids compara por nombre (servidor anterior a 20261202120000)', () => {
    expect(
      businessSellerDiffers({ ...base, created_by: undefined, seller_id: null })
    ).toBe(false);
    expect(
      businessSellerDiffers({ ...base, created_by: undefined, created_by_name: 'Otro', seller_id: null })
    ).toBe(true);
  });
});
