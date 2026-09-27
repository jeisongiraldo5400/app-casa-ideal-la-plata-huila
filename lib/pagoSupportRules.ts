/**
 * Reglas del soporte de un pago ya registrado («Adjuntar después»).
 *
 * Funciones puras: la pantalla decide con ellas qué mostrar y a quién, y el
 * repositorio local con cuál id y en qué carril encola la subida sin señal.
 */

/**
 * Espejo de `attach_negocio_pago_support` (20260807200000): admin, quien puede
 * gestionar el cobro del negocio (`can_manage_collection_for_negocio`, última
 * versión en 20261113120000: vendedor dueño o creador, gestor de cobro
 * asignado o recaudador) o quien registró el pago. Solo decide si se ofrece el
 * botón; el servidor vuelve a validar.
 */
export function canAttachPagoSupport(input: {
  userId: string | null | undefined;
  isAdmin: boolean;
  isVendedor: boolean;
  isGestorCobro: boolean;
  isRecaudador: boolean;
  negocio: {
    seller_id?: string | null;
    created_by?: string | null;
    gestor_cobro_id?: string | null;
  } | null;
  /** Autor del pago; un pago aún sin enviar lo registró este teléfono. */
  pagoCreatedBy: string | null | undefined;
  pagoIsLocal?: boolean;
}): boolean {
  const { userId, negocio } = input;
  if (!userId) return false;
  if (input.isAdmin) return true;
  if (input.pagoIsLocal) return true;
  if (input.pagoCreatedBy && input.pagoCreatedBy === userId) return true;
  if (!negocio) return false;
  if (input.isVendedor && (negocio.seller_id === userId || negocio.created_by === userId)) return true;
  if (input.isGestorCobro && negocio.gestor_cobro_id === userId) return true;
  return input.isRecaudador;
}

export type PagoSupportUiState =
  /** Tiene soporte en el servidor. */
  | 'attached'
  /** Hay un archivo en el teléfono esperando subir. */
  | 'queued'
  /** Sin soporte y su método lo exige: se destaca en rojo. */
  | 'required_missing'
  /** Sin soporte (opcional). */
  | 'missing'
  /** No se sabe (fila del teléfono de un pago ya sincronizado): no se ofrece adjuntar. */
  | 'unknown';

export function pagoSupportUiState(input: {
  pago: {
    id: string;
    /** `undefined` = la fila no trae el dato (vino de la base local). */
    support_path?: string | null;
    payment_method_id?: string | null;
  };
  /** Pagos con una subida pendiente en el teléfono (id local o de servidor). */
  queuedPagoIds: ReadonlySet<string>;
  /** Pagos que solo existen en el teléfono (aún sin enviar). */
  localPagoIds?: ReadonlySet<string>;
  methods: readonly { id: string; requiresSupport?: boolean }[];
}): PagoSupportUiState {
  const { pago } = input;
  if (pago.support_path) return 'attached';
  if (input.queuedPagoIds.has(pago.id)) return 'queued';
  const knowsSupport = pago.support_path === null || Boolean(input.localPagoIds?.has(pago.id));
  if (!knowsSupport) return 'unknown';
  const required =
    Boolean(pago.payment_method_id) &&
    input.methods.find((method) => method.id === pago.payment_method_id)?.requiresSupport === true;
  return required ? 'required_missing' : 'missing';
}

/**
 * Con qué ids y en qué carril se encola el soporte de un pago existente.
 * - Pago del teléfono aún sin confirmar: id local y el carril de su comando,
 *   para que el soporte suba DESPUÉS del pago (la reconciliación le pone el id
 *   del servidor al archivo).
 * - Pago del servidor: id del servidor y el carril por defecto del negocio.
 */
export function pagoSupportQueueTarget(input: {
  pagoId: string;
  localPago: { rowSyncStatus: string } | null;
  /** Comandos sin confirmar de cobro (`register_pago` / `register_route_pago`). */
  pagoCommands: readonly { payload: { pagoLocalId?: unknown; lane?: unknown } }[];
}): { pagoLocalId: string | null; pagoServerId: string | null; lane?: string } {
  const { pagoId, localPago } = input;
  if (localPago?.rowSyncStatus === 'rejected') {
    throw new Error('El servidor no aceptó este pago: no se le puede adjuntar soporte.');
  }
  const command = input.pagoCommands.find((item) => item.payload.pagoLocalId === pagoId);
  if (command || localPago?.rowSyncStatus === 'pending') {
    const lane = typeof command?.payload.lane === 'string' && command.payload.lane ? command.payload.lane : undefined;
    return { pagoLocalId: pagoId, pagoServerId: null, lane };
  }
  return { pagoLocalId: null, pagoServerId: pagoId };
}
