import {
  isCuotaInicial,
  labelCuotaNombre,
  labelCuotaNumero,
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

describe('labelCuotaNumero', () => {
  it('marca la cuota 0 como inicial', () => {
    expect(labelCuotaNumero(0)).toBe('Inicial');
    expect(labelCuotaNombre(0)).toBe('Cuota inicial');
    expect(isCuotaInicial(0)).toBe(true);
  });

  it('numera el plan de cuotas', () => {
    expect(labelCuotaNumero(3)).toBe('#3');
    expect(labelCuotaNombre(3)).toBe('Cuota 3');
  });
});
