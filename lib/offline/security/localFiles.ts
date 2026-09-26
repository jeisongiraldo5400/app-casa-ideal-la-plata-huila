import * as FileSystem from 'expo-file-system/legacy';

const SUPPORT_DIRECTORY_NAME = 'pago-soportes';
/** Firmas de negocios creados sin señal, a la espera de subir a Storage. */
const SIGNATURE_DIRECTORY_NAME = 'negocio-firmas';

function supportDirectoryFor(base: string) {
  return `${base}${SUPPORT_DIRECTORY_NAME}`;
}

function signatureDirectoryFor(base: string) {
  return `${base}${SIGNATURE_DIRECTORY_NAME}`;
}

export function getNegocioSignatureDirectory() {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!base) throw new Error('No hay almacenamiento local disponible para la firma');
  return signatureDirectoryFor(base);
}

/**
 * Guarda una firma recién capturada (`data:image/png;base64,…`) o ya escrita
 * en disco (`file:`/`content:`) dentro del almacenamiento privado de la app,
 * para poder subirla cuando vuelva la red. Devuelve la ruta local.
 */
export async function persistNegocioSignatureFile(
  source: string,
  localId: string,
  role: string
): Promise<string> {
  const directory = getNegocioSignatureDirectory();
  const destination = `${directory}/${localId}-${safePagoSupportFileName(role)}.png`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const match = source.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (match) {
    await FileSystem.writeAsStringAsync(destination, match[1], {
      encoding: FileSystem.EncodingType.Base64,
    });
    return destination;
  }
  await FileSystem.copyAsync({ from: source, to: destination });
  return destination;
}

export function getPagoSupportDirectory() {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!base) throw new Error('No hay almacenamiento local disponible para el soporte');
  return supportDirectoryFor(base);
}

export function safePagoSupportFileName(name: string) {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'soporte';
}

export async function persistPagoSupportFile(sourceUri: string, localId: string, fileName: string) {
  const directory = getPagoSupportDirectory();
  const destination = `${directory}/${localId}-${safePagoSupportFileName(fileName)}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

/**
 * ¿Sigue en el teléfono el archivo (firma o soporte) guardado sin señal? Si
 * no se puede comprobar se asume que sí: mejor intentar subirlo que dar por
 * perdida una firma que existe.
 */
export async function localFileExists(uri: string | null | undefined): Promise<boolean> {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return true;
  }
}

export async function deleteLocalPagoSupportFile(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export async function clearLocalPagoSupportFiles() {
  const bases = [FileSystem.documentDirectory, FileSystem.cacheDirectory].filter(
    (base): base is string => Boolean(base)
  );
  await Promise.all(
    // También las firmas pendientes: al borrar los datos locales no puede
    // quedar en el teléfono la firma de un cliente.
    [...new Set([...bases.map(supportDirectoryFor), ...bases.map(signatureDirectoryFor)])].map(
      (directory) => FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => undefined)
    )
  );
}
