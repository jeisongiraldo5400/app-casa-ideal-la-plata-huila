import { validateTransparentPng } from '@/lib/signaturePng';

function pngWithColorType(colorType: number) {
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, colorType, 0, 0, 0,
    0, 0, 0, 0,
  ]);
}

describe('validateTransparentPng', () => {
  it('acepta PNG con canal alfa', () => {
    expect(validateTransparentPng(pngWithColorType(6))).toBeNull();
  });

  it('rechaza archivos inválidos y PNG opacos', () => {
    expect(validateTransparentPng(Uint8Array.from([1, 2, 3]))).toBe('El archivo no es un PNG válido');
    expect(validateTransparentPng(pngWithColorType(2))).toBe('El PNG debe tener fondo transparente');
  });
});
