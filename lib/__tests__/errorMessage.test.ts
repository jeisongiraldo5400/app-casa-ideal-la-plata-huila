import { errorMessage } from '@/lib/errorMessage';

describe('errorMessage', () => {
  it('traduce la restricción por nombre antes que el código SQL', () => {
    expect(
      errorMessage({
        code: '23514',
        message: 'new row for relation "warehouse_stock" violates check constraint "warehouse_stock_quantity_check"',
      })
    ).toBe('La operación dejaría el stock de la bodega en negativo.');
  });

  it('encuentra el nombre de la restricción cuando viene en details', () => {
    expect(
      errorMessage({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details: 'Key (id_number)=(123) already exists. constraint "customers_id_number_key"',
      })
    ).toBe('Ya existe un cliente con ese número de documento.');
  });

  it('deja pasar el mensaje de negocio de un RAISE EXCEPTION', () => {
    expect(
      errorMessage({ code: 'P0001', message: 'Stock insuficiente para devolver 2 unidad(es)' })
    ).toBe('Stock insuficiente para devolver 2 unidad(es)');
  });

  it('traduce la caída de red, habitual en ruta', () => {
    expect(errorMessage(new TypeError('Network request failed'))).toBe(
      'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.'
    );
  });

  it('usa el respaldo cuando el error no dice nada', () => {
    expect(errorMessage(null, 'No se pudo guardar')).toBe('No se pudo guardar');
    expect(errorMessage({}, 'No se pudo guardar')).toBe('No se pudo guardar');
  });

  it('conserva el mensaje de un Error corriente', () => {
    expect(errorMessage(new Error('Indique un valor mayor a 0'))).toBe('Indique un valor mayor a 0');
  });
});
