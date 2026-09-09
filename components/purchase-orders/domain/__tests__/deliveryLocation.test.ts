import {
  EMPTY_DELIVERY_LOCATION_FILTER,
  countActiveLocationFilters,
  formatDeliveryAddressLine,
  formatDeliveryLocation,
  isDeliveryLocationFilterActive,
  matchesDeliveryLocation,
} from '../deliveryLocation';

describe('formatDeliveryLocation', () => {
  it('va de lo más específico a lo más general', () => {
    expect(
      formatDeliveryLocation({
        departamento_name: 'Huila',
        municipio_name: 'La Plata',
        vereda_name: 'El Carmen',
      }),
    ).toBe('El Carmen, La Plata, Huila');
  });

  it('omite los niveles que faltan sin dejar comas sueltas', () => {
    expect(formatDeliveryLocation({ departamento_name: 'Huila', municipio_name: 'La Plata' })).toBe(
      'La Plata, Huila',
    );
    expect(formatDeliveryLocation({})).toBe('');
    expect(formatDeliveryLocation({ municipio_name: '  ', departamento_name: null })).toBe('');
  });
});

describe('formatDeliveryAddressLine', () => {
  it('une ubicación y dirección con un guion', () => {
    expect(
      formatDeliveryAddressLine({
        departamento_name: 'Huila',
        municipio_name: 'La Plata',
        delivery_address: 'Calle 8 # 10-15',
      }),
    ).toBe('La Plata, Huila — Calle 8 # 10-15');
  });

  it('no deja el separador colgando cuando falta una de las dos partes', () => {
    expect(formatDeliveryAddressLine({ delivery_address: 'Calle 8' })).toBe('Calle 8');
    expect(formatDeliveryAddressLine({ municipio_name: 'La Plata' })).toBe('La Plata');
    expect(formatDeliveryAddressLine({})).toBe('');
  });
});

describe('countActiveLocationFilters / isDeliveryLocationFilterActive', () => {
  it('cuenta sólo los niveles puestos', () => {
    expect(countActiveLocationFilters(EMPTY_DELIVERY_LOCATION_FILTER)).toBe(0);
    expect(isDeliveryLocationFilterActive(EMPTY_DELIVERY_LOCATION_FILTER)).toBe(false);
    expect(
      countActiveLocationFilters({ departamentoId: 'd1', municipioId: 'm1', veredaId: '' }),
    ).toBe(2);
    expect(
      isDeliveryLocationFilterActive({ departamentoId: 'd1', municipioId: '', veredaId: '' }),
    ).toBe(true);
  });
});

describe('matchesDeliveryLocation', () => {
  const orden = { departamento_id: 'd1', municipio_id: 'm1', vereda_id: 'v1' };

  it('sin filtro pasa cualquier orden, incluso sin ubicación', () => {
    expect(matchesDeliveryLocation(orden, EMPTY_DELIVERY_LOCATION_FILTER)).toBe(true);
    expect(
      matchesDeliveryLocation(
        { departamento_id: null, municipio_id: null, vereda_id: null },
        EMPTY_DELIVERY_LOCATION_FILTER,
      ),
    ).toBe(true);
  });

  it('cada nivel puesto tiene que coincidir', () => {
    expect(
      matchesDeliveryLocation(orden, { departamentoId: 'd1', municipioId: '', veredaId: '' }),
    ).toBe(true);
    expect(
      matchesDeliveryLocation(orden, { departamentoId: 'd2', municipioId: '', veredaId: '' }),
    ).toBe(false);
    expect(
      matchesDeliveryLocation(orden, { departamentoId: 'd1', municipioId: 'm2', veredaId: '' }),
    ).toBe(false);
    expect(
      matchesDeliveryLocation(orden, { departamentoId: 'd1', municipioId: 'm1', veredaId: 'v1' }),
    ).toBe(true);
  });

  it('una orden sin ubicación (remisión o histórica) queda fuera al filtrar', () => {
    const sinUbicacion = { departamento_id: null, municipio_id: null, vereda_id: null };
    expect(
      matchesDeliveryLocation(sinUbicacion, { departamentoId: 'd1', municipioId: '', veredaId: '' }),
    ).toBe(false);
  });

  it('filtrar por municipio no exige que la orden tenga vereda', () => {
    const sinVereda = { departamento_id: 'd1', municipio_id: 'm1', vereda_id: null };
    expect(
      matchesDeliveryLocation(sinVereda, { departamentoId: 'd1', municipioId: 'm1', veredaId: '' }),
    ).toBe(true);
  });
});
