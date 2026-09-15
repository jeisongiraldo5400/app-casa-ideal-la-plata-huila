import {
  canEditNegocioContactDetails,
  isNegocioDraft,
  negocioContactDetailsChanged,
  negocioContactDetailsError,
  negocioLockedEditMessage,
} from '../negocioEditRules';

describe('negocioEditRules', () => {
  it.each(['borrador', 'por_firmar'])('%s se edita completo (activación)', (status) => {
    expect(isNegocioDraft(status)).toBe(true);
    expect(canEditNegocioContactDetails(status)).toBe(false);
  });

  it.each(['activo', 'entregado', 'cerrado'])('%s solo edita dirección y notas', (status) => {
    expect(isNegocioDraft(status)).toBe(false);
    expect(canEditNegocioContactDetails(status)).toBe(true);
  });

  it('anulado no edita nada', () => {
    expect(canEditNegocioContactDetails('anulado')).toBe(false);
    expect(canEditNegocioContactDetails(null)).toBe(false);
  });

  it('usa el mismo mensaje que el servidor', () => {
    expect(negocioLockedEditMessage(2026001, 'activo')).toBe(
      'El negocio 2026001 está Activo: solo se pueden editar la dirección, las notas y el gestor de cobro. ' +
        'Para cambiar productos, precios, cuotas o cliente, un administrador debe anularlo y crear uno nuevo.'
    );
    expect(negocioLockedEditMessage(2026004, 'anulado')).toBe('El negocio 2026004 está Anulado: no se puede editar.');
  });

  it('valida municipio y dirección y detecta cambios normalizados', () => {
    const input = { direccion: ' Calle 1 ', municipioId: 'm-1', veredaId: '', notes: '' };
    expect(negocioContactDetailsError(input)).toBeNull();
    expect(negocioContactDetailsError({ ...input, municipioId: '' })).toBe('Seleccione un municipio activo');
    expect(negocioContactDetailsError({ ...input, direccion: '' })).toBe('La dirección del negocio es obligatoria');
    const current = { direccion: 'Calle 1', municipio_id: 'm-1', vereda_id: null, notes: null };
    expect(negocioContactDetailsChanged(current, input)).toBe(false);
    expect(negocioContactDetailsChanged(current, { ...input, notes: 'Portón verde' })).toBe(true);
  });
});
