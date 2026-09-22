import { clearAutoFilled, resolveNegocioLocation, type NegocioLocation } from '../negocioLocation';

const municipios = [
  { id: 'la-plata', departamento_id: 'huila' },
  { id: 'neiva', departamento_id: 'huila' },
  { id: 'popayan', departamento_id: 'cauca' },
];

const empty: NegocioLocation = { departamentoId: '', municipioId: '', veredaId: '', direccion: '' };

describe('resolveNegocioLocation', () => {
  it('rellena todo con la vivienda guardada del cliente', () => {
    expect(
      resolveNegocioLocation({
        current: empty,
        customer: { municipioId: 'la-plata', veredaId: 'el-carmen', address: 'Calle 5 # 3-20' },
        municipios,
      })
    ).toEqual({ departamentoId: 'huila', municipioId: 'la-plata', veredaId: 'el-carmen', direccion: 'Calle 5 # 3-20' });
  });

  // Caso real: ANA ELISA SANCHEZ no tenía municipio guardado. Las órdenes de
  // cliente siempre lo tienen, así que la orden sirve de respaldo.
  it('si el cliente no tiene municipio, usa la ubicación de la orden', () => {
    expect(
      resolveNegocioLocation({
        current: empty,
        customer: { municipioId: null, veredaId: null, address: null },
        order: { municipioId: 'neiva', veredaId: null, address: 'Barrio Centro' },
        municipios,
      })
    ).toEqual({ departamentoId: 'huila', municipioId: 'neiva', veredaId: '', direccion: 'Barrio Centro' });
  });

  it('prefiere el cliente a la orden aunque ambos tengan ubicación', () => {
    const result = resolveNegocioLocation({
      current: empty,
      customer: { municipioId: 'la-plata', veredaId: null, address: 'Casa del cliente' },
      order: { municipioId: 'neiva', veredaId: null, address: 'Punto de entrega' },
      municipios,
    });
    expect(result.municipioId).toBe('la-plata');
    expect(result.direccion).toBe('Casa del cliente');
  });

  it('no pisa lo que el usuario ya escribió', () => {
    const current = { departamentoId: 'huila', municipioId: 'neiva', veredaId: 'v1', direccion: 'Escrita a mano' };
    expect(
      resolveNegocioLocation({
        current,
        customer: { municipioId: 'la-plata', veredaId: 'el-carmen', address: 'Otra' },
        municipios,
      })
    ).toEqual(current);
  });

  it('no mezcla un municipio de otro departamento con el departamento ya elegido', () => {
    const result = resolveNegocioLocation({
      current: { ...empty, departamentoId: 'cauca' },
      customer: { municipioId: 'la-plata', veredaId: null, address: null },
      municipios,
    });
    expect(result).toEqual({ ...empty, departamentoId: 'cauca' });
  });

  it('completa la dirección aunque no haya municipio conocido', () => {
    expect(
      resolveNegocioLocation({
        current: empty,
        customer: { municipioId: null, veredaId: null, address: 'EL CARMEN DE LA PLATA' },
        municipios,
      })
    ).toEqual({ ...empty, direccion: 'EL CARMEN DE LA PLATA' });
  });

  it('sin datos no cambia nada', () => {
    expect(resolveNegocioLocation({ current: empty, municipios })).toEqual(empty);
  });

  it('ignora un municipio que ya no está en el maestro', () => {
    expect(
      resolveNegocioLocation({
        current: empty,
        customer: { municipioId: 'desaparecido', veredaId: null, address: null },
        municipios,
      })
    ).toEqual(empty);
  });
});

describe('clearAutoFilled', () => {
  const auto: NegocioLocation = { departamentoId: 'huila', municipioId: 'la-plata', veredaId: 'el-carmen', direccion: 'Calle 5' };

  it('vacía lo que sigue igual a lo rellenado para el cliente anterior', () => {
    expect(clearAutoFilled(auto, auto)).toEqual(empty);
  });

  it('respeta la dirección editada a mano', () => {
    expect(clearAutoFilled({ ...auto, direccion: 'Editada' }, auto)).toEqual({ ...empty, direccion: 'Editada' });
  });

  it('si el municipio lo cambió el usuario, conserva todo el bloque de ubicación', () => {
    const current = { ...auto, municipioId: 'neiva' };
    expect(clearAutoFilled(current, auto)).toEqual({ departamentoId: 'huila', municipioId: 'neiva', veredaId: 'el-carmen', direccion: '' });
  });

  it('sin relleno previo no toca nada', () => {
    expect(clearAutoFilled(auto, null)).toEqual(auto);
  });
});
