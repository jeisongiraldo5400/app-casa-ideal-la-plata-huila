const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function readChunkType(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

export function validateTransparentPng(bytes: Uint8Array): string | null {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return 'El archivo no es un PNG válido';
  }
  if (readChunkType(bytes, 12) !== 'IHDR') return 'El archivo PNG no contiene cabecera válida';

  const colorType = bytes[25];
  if (colorType === 4 || colorType === 6) return null;
  if (colorType !== 3 && colorType !== 0 && colorType !== 2) return 'El formato PNG no es compatible';

  let offset = 33;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const typeOffset = offset + 4;
    if (typeOffset + 4 + length + 4 > bytes.length) return 'El archivo PNG está incompleto';
    if (readChunkType(bytes, typeOffset) === 'tRNS') return null;
    if (readChunkType(bytes, typeOffset) === 'IEND') break;
    offset = typeOffset + 4 + length + 4;
  }
  return 'El PNG debe tener fondo transparente';
}

export async function validateTransparentPngUri(uri: string): Promise<void> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('No se pudo leer el PNG seleccionado');
  const validationError = validateTransparentPng(new Uint8Array(await response.arrayBuffer()));
  if (validationError) throw new Error(validationError);
}
