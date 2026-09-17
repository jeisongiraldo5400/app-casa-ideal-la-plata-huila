import { buildShareMessage, buildWhatsAppUrl, shareLinkRecipient } from '../shareMessages';

describe('buildShareMessage', () => {
  it('usa el mismo texto que el web e incluye la URL (Android ignora el campo `url` de Share)', () => {
    expect(buildShareMessage({ url: 'https://catalogo.test/c/abc123' })).toBe('Te comparto este catálogo de Casa Ideal: https://catalogo.test/c/abc123');
  });

  it('saluda al destinatario solo cuando se proporciona', () => {
    expect(buildShareMessage({ url: 'https://x/c/t', label: ' Ana ' })).toBe('Hola Ana. Te comparto este catálogo de Casa Ideal: https://x/c/t');
  });

  it('no saluda a nadie cuando el nombre está vacío o son solo espacios', () => {
    for (const label of ['', '   ', null, undefined]) {
      const message = buildShareMessage({ url: 'https://catalogo.test/c/abc123', label });
      expect(message.startsWith('Te comparto este catálogo')).toBe(true);
      expect(message).not.toContain('Hola');
    }
  });
});

describe('shareLinkRecipient', () => {
  it('devuelve el nombre recortado o null si el enlace no tiene destinatario', () => {
    expect(shareLinkRecipient('  Familia Pérez ')).toBe('Familia Pérez');
    expect(shareLinkRecipient('')).toBeNull();
    expect(shareLinkRecipient('   ')).toBeNull();
    expect(shareLinkRecipient(null)).toBeNull();
    expect(shareLinkRecipient(undefined)).toBeNull();
  });
});

describe('buildWhatsAppUrl', () => {
  it('codifica el mensaje para wa.me', () => {
    expect(buildWhatsAppUrl('Hola: https://catalogo.test/c/ab')).toBe('https://wa.me/?text=Hola%3A%20https%3A%2F%2Fcatalogo.test%2Fc%2Fab');
  });
});
