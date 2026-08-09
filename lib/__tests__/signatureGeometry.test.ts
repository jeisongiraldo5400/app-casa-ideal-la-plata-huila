import {
  fitSignaturePad,
  mapPointToSignature,
  SIGNATURE_CANVAS_HEIGHT,
  SIGNATURE_CANVAS_WIDTH,
} from '@/lib/signatureGeometry';

describe('signatureGeometry', () => {
  it('convierte cualquier tamaño visible al mismo lienzo horizontal', () => {
    expect(mapPointToSignature(300, 100, 600, 200)).toEqual({
      x: SIGNATURE_CANVAS_WIDTH / 2,
      y: SIGNATURE_CANVAS_HEIGHT / 2,
    });
    expect(mapPointToSignature(600, 200, 1200, 400)).toEqual({
      x: SIGNATURE_CANVAS_WIDTH / 2,
      y: SIGNATURE_CANVAS_HEIGHT / 2,
    });
  });

  it('ajusta el área sin perder la relación horizontal 3:1', () => {
    expect(fitSignaturePad(900, 200)).toEqual({ width: 600, height: 200 });
    expect(fitSignaturePad(600, 400)).toEqual({ width: 600, height: 200 });
  });

  it('limita coordenadas fuera del área de firma', () => {
    expect(mapPointToSignature(-20, 999, 600, 200)).toEqual({
      x: 0,
      y: SIGNATURE_CANVAS_HEIGHT,
    });
  });
});
