import { updateNegocioContactDetails } from '../negocioContactDetailsService';

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

describe('updateNegocioContactDetails', () => {
  beforeEach(() => mockRpc.mockReset());

  it('llama al RPC con valores normalizados y NULL para vereda y notas vacías', async () => {
    mockRpc.mockResolvedValue({ data: { negocio_id: 'n-1', changed: true }, error: null });
    const result = await updateNegocioContactDetails('n-1', {
      direccion: '  Calle 9  ',
      municipioId: 'm-1',
      veredaId: '',
      notes: '   ',
    });
    expect(mockRpc).toHaveBeenCalledWith('update_negocio_contact_details', {
      p_negocio_id: 'n-1',
      p_direccion: 'Calle 9',
      p_municipio_id: 'm-1',
      p_vereda_id: null,
      p_notes: null,
    });
    expect(result).toEqual({ negocio_id: 'n-1', changed: true });
  });

  it('propaga el mensaje del servidor', async () => {
    const error = { code: 'P0001', message: 'Sin permiso para editar la dirección y las notas de este negocio' };
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(
      updateNegocioContactDetails('n-1', { direccion: 'Calle', municipioId: 'm-1', veredaId: 'v-1', notes: 'x' })
    ).rejects.toBe(error);
  });
});
