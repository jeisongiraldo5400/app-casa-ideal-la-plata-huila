import {
  labelCuotaStatus,
  labelNegocioStatus,
} from '../negocioLabels';

describe('negocioLabels', () => {
  it('presenta el estado técnico por_firmar como pendiente de activación', () => {
    expect(labelNegocioStatus('por_firmar')).toBe('Por activar');
  });

  it('mantiene etiquetas legibles para las cuotas', () => {
    expect(labelCuotaStatus('mora')).toBe('En mora');
  });

  it('conserva estados desconocidos para facilitar el diagnóstico', () => {
    expect(labelNegocioStatus('estado_nuevo')).toBe('estado_nuevo');
  });
});
