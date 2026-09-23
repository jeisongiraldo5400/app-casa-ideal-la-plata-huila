import { errorMessage, isOfflineError } from './errorMessage';

/** Título y texto del aviso que se muestra tras un escaneo sin resultado. */
export interface ScanFailureAlert {
  title: string;
  message: string;
}

/**
 * Distingue «este código no existe» de «no se pudo consultar».
 *
 * PostgREST devuelve los fallos de red dentro de `error` (no como excepción),
 * así que la pantalla los confundía con una búsqueda sin resultados y afirmaba
 * «Producto no encontrado» estando sin señal: el bodeguero concluía que el
 * producto no estaba creado.
 */
export function describeScanFailure(error: unknown, barcode: string): ScanFailureAlert {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  // Sin error, o con el código de «0 filas» de `.single()`: de verdad no existe.
  if (!error || code === 'PGRST116') {
    return {
      title: 'Producto no encontrado',
      message: `No se encontró un producto con el código de barras: ${barcode}`,
    };
  }

  if (isOfflineError(error)) {
    return {
      title: 'Sin conexión',
      message: `No se pudo consultar el código ${barcode}: la app no tiene conexión con el servidor. Revisa tu red e inténtalo de nuevo.`,
    };
  }

  return {
    title: 'No se pudo consultar',
    message: `${errorMessage(error, 'No se pudo consultar el producto.')} Código leído: ${barcode}`,
  };
}
