import {
  canRegisterCustomerSignatureLater,
  sellerSignatureRequiredError,
} from '../negocioSignatureRules';

describe('sellerSignatureRequiredError', () => {
  it('exige la firma del vendedor cuando no hay firma del cliente', () => {
    expect(sellerSignatureRequiredError('', '')).toMatch(/firma del vendedor/i);
    expect(sellerSignatureRequiredError(null, '   ')).toMatch(/firma del vendedor/i);
    expect(sellerSignatureRequiredError(undefined, undefined)).not.toBeNull();
  });

  it('acepta la firma del vendedor sin firma del cliente', () => {
    expect(sellerSignatureRequiredError('', 'file:///tmp/firma.png')).toBeNull();
  });

  it('acepta la firma del cliente sin firma del vendedor', () => {
    expect(sellerSignatureRequiredError('data:image/png;base64,AAA', null)).toBeNull();
  });
});

describe('canRegisterCustomerSignatureLater', () => {
  it.each(['activo', 'entregado'])(
    'permite registrar la firma del cliente en un negocio %s sin firma',
    (status) => {
      expect(canRegisterCustomerSignatureLater({ status, customer_signature_url: null })).toBe(true);
    }
  );

  it.each(['borrador', 'por_firmar', 'anulado', 'cerrado'])(
    'no ofrece el registro tardío en estado %s',
    (status) => {
      expect(canRegisterCustomerSignatureLater({ status, customer_signature_url: null })).toBe(false);
    }
  );

  it('no ofrece el registro cuando el negocio ya tiene firma del cliente', () => {
    expect(
      canRegisterCustomerSignatureLater({ status: 'activo', customer_signature_url: 'uid/n1/cliente-1.png' })
    ).toBe(false);
    expect(canRegisterCustomerSignatureLater(null)).toBe(false);
  });
});
