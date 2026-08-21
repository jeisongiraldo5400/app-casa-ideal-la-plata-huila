import * as FileSystem from 'expo-file-system/legacy';

const SUPPORT_DIRECTORY_NAME = 'pago-soportes';

function supportDirectoryFor(base: string) {
  return `${base}${SUPPORT_DIRECTORY_NAME}`;
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

export async function deleteLocalPagoSupportFile(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export async function clearLocalPagoSupportFiles() {
  const bases = [FileSystem.documentDirectory, FileSystem.cacheDirectory].filter(
    (base): base is string => Boolean(base)
  );
  await Promise.all(
    [...new Set(bases.map(supportDirectoryFor))].map((directory) =>
      FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => undefined)
    )
  );
}
