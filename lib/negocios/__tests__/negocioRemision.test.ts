import {
  fetchNegocioRemisionVigente,
  labelRemisionVigente,
  parseRemisionVigente,
} from '@/lib/negocios/negocioRemision';

const fila = { remission_id: 'r1', remission_number: 'OE-2026-0042', remission_status: 'pending' };

describe('parseRemisionVigente', () => {
  it('toma la primera fila del RPC', () => {
    expect(parseRemisionVigente([fila])).toEqual({ id: 'r1', numero: 'OE-2026-0042' });
  });

  it('sin filas o sin id no hay remisión', () => {
    expect(parseRemisionVigente([])).toBeNull();
    expect(parseRemisionVigente(null)).toBeNull();
    expect(parseRemisionVigente([{ remission_number: 'OE-1' }])).toBeNull();
  });

  it('un número vacío queda en null', () => {
    expect(parseRemisionVigente([{ remission_id: 'r1', remission_number: '  ' }])).toEqual({ id: 'r1', numero: null });
  });
});

describe('labelRemisionVigente', () => {
  it('arma la línea del detalle', () => {
    expect(labelRemisionVigente({ id: 'r1', numero: 'OE-2026-0042' })).toBe('Sale en la remisión OE-2026-0042');
    expect(labelRemisionVigente({ id: 'r1', numero: null })).toBe('Sale en la remisión sin número');
  });
});

describe('fetchNegocioRemisionVigente', () => {
  it('llama al RPC con el negocio y devuelve la remisión', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [fila], error: null });
    await expect(fetchNegocioRemisionVigente({ rpc }, 'n1')).resolves.toEqual({ id: 'r1', numero: 'OE-2026-0042' });
    expect(rpc).toHaveBeenCalledWith('get_negocio_active_remission', { p_negocio_id: 'n1' });
  });

  it('un servidor sin la función (o cualquier error) no muestra la línea', async () => {
    const conError = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(fetchNegocioRemisionVigente({ rpc: conError }, 'n1')).resolves.toBeNull();
    const sinRed = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetchNegocioRemisionVigente({ rpc: sinRed }, 'n1')).resolves.toBeNull();
  });
});
