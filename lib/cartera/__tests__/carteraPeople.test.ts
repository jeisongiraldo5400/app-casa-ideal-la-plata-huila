import { businessSellerDiffers, carteraPeopleLines } from '../carteraPeople';

const base = {
  created_by: 'u-registra',
  created_by_name: 'Ana Registra',
  seller_id: 'u-dueno',
  seller_name: 'Beto Dueño',
  customer_seller_id: 'u-dueno',
  customer_seller_name: 'Beto Dueño',
};

describe('carteraPeopleLines', () => {
  it('regla: el vendedor es el dueño del cliente y aparte quien lo creó', () => {
    expect(carteraPeopleLines(base)).toEqual([
      { key: 'customer_seller', label: 'Vendedor (dueño del cliente)', value: 'Beto Dueño' },
      { key: 'registered_by', label: 'Creado por', value: 'Ana Registra' },
    ]);
  });

  it('cliente sin vendedor: lo dice en vez de dejarlo vacío', () => {
    const lines = carteraPeopleLines({ ...base, customer_seller_id: null, customer_seller_name: null });
    expect(lines[0]).toEqual({
      key: 'customer_seller',
      label: 'Vendedor (dueño del cliente)',
      value: 'Sin asignar',
    });
  });

  it('negocio que guarda otro vendedor (anterior a la regla): lo rotula aparte', () => {
    const lines = carteraPeopleLines({ ...base, seller_id: 'u-registra', seller_name: 'Ana Registra' });
    expect(lines.map((line) => `${line.label}: ${line.value}`)).toEqual([
      'Vendedor (dueño del cliente): Beto Dueño',
      'Creado por: Ana Registra',
      'Vendedor registrado en el negocio: Ana Registra',
    ]);
  });

  it('negocio viejo sin quien lo registró: raya en «Creado por»', () => {
    const lines = carteraPeopleLines({ ...base, created_by: null, created_by_name: null });
    expect(lines.map((line) => line.value)).toEqual(['Beto Dueño', '—']);
  });

  it('sin ids compara por nombre', () => {
    const { customer_seller_id: _omit, ...sinIds } = base;
    expect(businessSellerDiffers({ ...sinIds, seller_id: null })).toBe(false);
    expect(businessSellerDiffers({ ...sinIds, seller_id: null, seller_name: 'Otro' })).toBe(true);
  });
});
