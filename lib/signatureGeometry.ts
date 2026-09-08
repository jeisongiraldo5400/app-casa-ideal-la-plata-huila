export const SIGNATURE_CANVAS_WIDTH = 1200;
export const SIGNATURE_CANVAS_HEIGHT = 400;
export const SIGNATURE_ASPECT_RATIO =
  SIGNATURE_CANVAS_WIDTH / SIGNATURE_CANVAS_HEIGHT;

export interface SignaturePoint {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function mapPointToSignature(
  x: number,
  y: number,
  displayWidth: number,
  displayHeight: number
): SignaturePoint {
  if (displayWidth <= 0 || displayHeight <= 0) return { x: 0, y: 0 };

  return {
    x: clamp((x / displayWidth) * SIGNATURE_CANVAS_WIDTH, 0, SIGNATURE_CANVAS_WIDTH),
    y: clamp((y / displayHeight) * SIGNATURE_CANVAS_HEIGHT, 0, SIGNATURE_CANVAS_HEIGHT),
  };
}

export function fitSignaturePad(maxWidth: number, maxHeight: number) {
  const safeWidth = Math.max(1, maxWidth);
  const safeHeight = Math.max(1, maxHeight);
  const width = Math.min(safeWidth, safeHeight * SIGNATURE_ASPECT_RATIO);

  return {
    width,
    height: width / SIGNATURE_ASPECT_RATIO,
  };
}
