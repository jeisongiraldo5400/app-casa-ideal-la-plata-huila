/** Mensaje legible de cualquier error (Error, PostgrestError o desconocido). */
export function errorMessage(error: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
