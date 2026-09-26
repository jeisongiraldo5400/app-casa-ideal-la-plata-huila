import { errorMessage, OFFLINE_MESSAGE } from '@/lib/errorMessage';

/**
 * Prefijo con el que `syncEngine` marca lo que no se pudo enviar tras agotar
 * los intentos. Se conserva al traducir para que se siga distinguiendo de un
 * rechazo del servidor.
 */
export const EXHAUSTED_RETRIES_PREFIX = 'No se pudo enviar al servidor después de varios intentos: ';

/**
 * Traducciones propias de la cola. Van antes que las de `errorMessage` (que
 * sigue resolviendo «duplicate key», restricciones con nombre, permisos…)
 * porque aquí un «Aborted» es un corte de red (tiempo límite del cliente) y no
 * una operación cancelada por la persona.
 */
const SYNC_PATTERNS: [RegExp, string][] = [
  [
    /could not find the function|function .* does not exist|PGRST202/i,
    'El servidor todavía no tiene esta función. Actualice la app o avise al administrador; la cola lo volverá a intentar.',
  ],
  [/JWT expired|invalid JWT|PGRST301/i, 'La sesión expiró. Vuelva a iniciar sesión para enviar los cambios.'],
  [/idx_negocios_unique_customer_source_oe/i, 'Otro negocio ya tomó esta orden de entrega.'],
  [
    /network request failed|failed to fetch|load failed|^(typeerror: )?aborted|aborterror|no respondi[óo] a tiempo/i,
    OFFLINE_MESSAGE,
  ],
  [/deadlock detected|could not serialize access/i, 'El servidor estaba ocupado con otro cambio; se volverá a intentar.'],
  [/statement timeout|canceling statement/i, 'El servidor tardó demasiado en responder; se volverá a intentar.'],
  [/bad gateway|service unavailable|gateway timeout|\b50[234]\b/i, 'El servidor no está disponible en este momento; se volverá a intentar.'],
];

function translate(raw: string): string {
  const text = raw.trim();
  if (!text) return text;
  for (const [pattern, message] of SYNC_PATTERNS) {
    if (pattern.test(text)) return message;
  }
  return errorMessage({ message: text }, text);
}

/**
 * Texto de `sync_outbox.last_error` listo para la persona: los mensajes de
 * regla de negocio del servidor ya vienen en español y se respetan; los
 * técnicos en inglés («duplicate key», «JWT expired», «Network request
 * failed», «Could not find the function…») se cambian por una explicación.
 */
export function syncErrorText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith(EXHAUSTED_RETRIES_PREFIX)) {
    return `${EXHAUSTED_RETRIES_PREFIX}${translate(raw.slice(EXHAUSTED_RETRIES_PREFIX.length))}`;
  }
  return translate(raw);
}
