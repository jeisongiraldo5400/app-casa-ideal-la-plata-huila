import { describeScanFailure } from '@/lib/barcodeScanFeedback';

describe('describeScanFailure', () => {
  it('sin error: el código de verdad no existe', () => {
    expect(describeScanFailure(null, '7701')).toEqual({
      title: 'Producto no encontrado',
      message: 'No se encontró un producto con el código de barras: 7701',
    });
  });

  it('PGRST116 (cero filas de .single()) también es «no encontrado»', () => {
    const alert = describeScanFailure(
      { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      '7701'
    );
    expect(alert.title).toBe('Producto no encontrado');
  });

  it('un fallo de red NO se anuncia como producto inexistente', () => {
    const alert = describeScanFailure({ code: '', message: 'TypeError: Network request failed' }, '7701');
    expect(alert.title).toBe('Sin conexión');
    expect(alert.message).toContain('7701');
    expect(alert.message).not.toContain('No se encontró');
  });

  it('otro fallo del servidor se cuenta como consulta fallida y en español', () => {
    const alert = describeScanFailure({ code: '42501', message: 'permission denied for table products' }, '7701');
    expect(alert.title).toBe('No se pudo consultar');
    expect(alert.message).toBe('No tiene permiso para realizar esta acción sobre los productos. Código leído: 7701');
  });
});
