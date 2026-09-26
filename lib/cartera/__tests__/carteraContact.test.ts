import { mapsHref, telHref } from '../carteraContact';

describe('telHref', () => {
  it('limpia espacios y guiones', () => {
    expect(telHref('300 123-4567')).toBe('tel:3001234567');
    expect(telHref('+57 300 123 4567')).toBe('tel:+573001234567');
  });
  it('sin un número marcable no hay acción', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref('')).toBeNull();
    expect(telHref('n/a')).toBeNull();
    expect(telHref('123')).toBeNull();
  });
});

describe('mapsHref', () => {
  it('busca dirección, municipio y departamento en Colombia', () => {
    expect(mapsHref({ address: 'Cra 5 # 10-20', municipio: 'Rionegro', departamento: 'Antioquia' })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Cra 5 # 10-20, Rionegro, Antioquia, Colombia')}`
    );
  });
  it('con solo el municipio también abre; sin nada, no', () => {
    expect(mapsHref({ municipio: 'Marinilla' })).toContain(encodeURIComponent('Marinilla, Colombia'));
    expect(mapsHref({ address: '  ', municipio: null })).toBeNull();
  });
});
