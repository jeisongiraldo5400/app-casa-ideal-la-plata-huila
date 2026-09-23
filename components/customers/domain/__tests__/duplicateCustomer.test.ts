import { duplicateCustomerPrompt } from '../duplicateCustomer';

describe('duplicateCustomerPrompt', () => {
  it('ofrece usar el cliente que ya tiene el documento', () => {
    const prompt = duplicateCustomerPrompt(
      { id: 'c1', name: 'MARGOTH ORTEGA SERRATO', id_number: '55212681', deleted: false },
      ' 55212681 '
    );
    expect(prompt.canUse).toBe(true);
    expect(prompt.message).toBe('El documento 55212681 ya es de MARGOTH ORTEGA SERRATO. ¿Quieres usar ese cliente?');
  });

  it('si el cliente está eliminado, explica que hay que restaurarlo', () => {
    const prompt = duplicateCustomerPrompt({ id: 'c1', name: 'ANA', id_number: '123', deleted: true }, '123');
    expect(prompt.canUse).toBe(false);
    expect(prompt.title).toBe('Cliente eliminado');
    expect(prompt.message).toContain('restaure desde la web');
  });

  it('si no se pudo saber quién es, lo dice sin jerga técnica', () => {
    const prompt = duplicateCustomerPrompt(null, '123');
    expect(prompt.canUse).toBe(false);
    expect(prompt.message).toBe(
      'Ya existe un cliente con el documento 123. Búscalo por su nombre o documento en lugar de crearlo de nuevo.'
    );
    expect(prompt.message).not.toMatch(/duplicate|constraint/i);
  });
});
