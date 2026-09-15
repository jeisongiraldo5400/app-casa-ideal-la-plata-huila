/**
 * Convierte errores de Supabase / PostgREST / Postgres / red en un mensaje en
 * español apto para el usuario final. Espejo de `toUserMessage` en la web.
 *
 * Antes esta función devolvía `error.message` crudo, así que una violación de
 * restricción llegaba al vendedor como texto de Postgres en inglés (o, peor,
 * como el genérico del código SQL) sin decir qué regla se incumplió.
 */
const BY_CODE: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'No se puede completar: el registro está relacionado con otros datos.',
  '23514': 'Los datos no cumplen una regla de validación.',
  '23502': 'Falta un dato obligatorio.',
  // 42501 no está aquí: ver `permissionDeniedMessage` (el texto propio de un
  // RAISE con ese código ya viene en español y es más útil que el genérico).
  '22P02': 'Alguno de los datos tiene un formato inválido.',
  P0001: '', // RAISE EXCEPTION de negocio: el mensaje ya viene en español
  PGRST116: 'No se encontró el registro.',
  PGRST301: 'La sesión expiró. Vuelve a iniciar sesión.',
};

/**
 * Mensajes por nombre de restricción. Postgres incluye el nombre en el texto
 * ("violates check constraint \"x\""), así que se puede decir qué pasó en vez
 * del genérico del código. Se consulta antes que `BY_CODE`.
 */
const BY_CONSTRAINT: Record<string, string> = {
  warehouse_stock_quantity_check: 'La operación dejaría el stock de la bodega en negativo.',
  inventory_entries_quantity_check: 'La cantidad de la entrada debe ser mayor a cero.',
  inventory_exits_quantity_check: 'La cantidad de la salida debe ser mayor a cero.',
  returns_quantity_check: 'La cantidad a devolver debe ser mayor a cero.',
  delivery_order_returns_quantity_check: 'La cantidad a devolver debe ser mayor a cero.',
  check_delivery_order_item_quantity: 'La cantidad del producto en la orden debe ser mayor a cero.',
  check_delivery_order_item_delivered_quantity:
    'La cantidad entregada no puede superar la cantidad de la orden.',
  different_warehouses: 'La bodega de origen y la de destino deben ser distintas.',
  warehouse_stock_unique: 'Ya existe un registro de stock para ese producto en esa bodega.',
  customers_id_number_key: 'Ya existe un cliente con ese número de documento.',
  profiles_email_key: 'Ya existe un usuario con ese correo.',
  warehouses_name_key: 'Ya existe una bodega con ese nombre.',
  roles_nombre_key: 'Ya existe un rol con ese nombre.',
  permisos_nombre_key: 'Ya existe un permiso con ese nombre.',
  product_suppliers_unique: 'Ese proveedor ya está asociado al producto.',
};

const BY_PATTERN: Array<[RegExp, string]> = [
  [
    /failed to fetch|network request failed|networkerror|load failed|ERR_NETWORK|timeout/i,
    'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
  ],
  [/duplicate key value/i, 'Ya existe un registro con esos datos.'],
  [/violates foreign key/i, 'No se puede completar: el registro está relacionado con otros datos.'],
  [/violates check constraint/i, 'Los datos no cumplen una regla de validación.'],
  [/JWT expired|invalid JWT/i, 'La sesión expiró. Vuelve a iniciar sesión.'],
  [/AbortError|aborted/i, 'La operación fue cancelada.'],
];

export const PERMISSION_DENIED_MESSAGE = 'No tiene permiso para realizar esta acción.';

/**
 * Qué protege cada tabla cerrada por permisos o RLS, para decir sobre qué se
 * rechazó la acción. Espejo de la web; las demás tablas reciben el genérico.
 */
const PERMISSION_CONTEXT_BY_TABLE: Record<string, string> = {
  delivery_orders: 'las órdenes de entrega',
  delivery_order_items: 'los productos de la orden de entrega',
  delivery_order_status_observations: 'el historial de estados de la orden de entrega',
  delivery_order_edit_observations: 'el historial de ediciones de la orden de entrega',
  delivery_order_item_approvals: 'las aprobaciones de productos de la orden de entrega',
  delivery_order_returns: 'las devoluciones de la orden de entrega',
  remission_delivery_orders: 'las órdenes asignadas a la remisión',
  purchase_orders: 'las órdenes de compra',
  purchase_order_items: 'los productos de la orden de compra',
  purchase_order_status_observations: 'el historial de estados de la orden de compra',
  returns: 'las devoluciones a proveedor',
  inventory_entries: 'las entradas de inventario',
  inventory_exits: 'las salidas de inventario',
  warehouse_stock: 'el stock de las bodegas',
  stock_adjustment_logs: 'los ajustes de stock',
  stock_transfers: 'los traslados de stock',
  products: 'los productos',
  negocios: 'los negocios',
  negocio_cuotas: 'las cuotas del negocio',
  negocio_pagos: 'los pagos del negocio',
  customers: 'los clientes',
  profiles: 'los usuarios',
  user_roles: 'los roles de los usuarios',
  roles: 'los roles',
  permisos: 'los permisos',
  configuration_change_log: 'la bitácora de cambios de configuración',
  operation_error_logs: 'el registro de errores',
};

/** Textos técnicos (en inglés) de un rechazo por permisos o RLS. */
const TECHNICAL_PERMISSION_TEXT =
  /permission denied|row-level security|must be owner|insufficient privilege|^forbidden$|not authorized|unauthorized|authentication required/i;

/**
 * Mensaje para un rechazo por permisos («permission denied for table …» o
 * «new row violates row-level security policy for table "…"»), con o sin
 * código 42501. Con la tabla reconocida dice sobre qué se rechazó. Un 42501
 * con texto propio en español se respeta. `null` si no es de permisos.
 */
export function permissionDeniedMessage(code: string, message: string): string | null {
  const technical = TECHNICAL_PERMISSION_TEXT.test(message);
  if (!technical) {
    if (code !== '42501') return null;
    return message.trim() || PERMISSION_DENIED_MESSAGE;
  }
  const table = message.match(/(?:for (?:table|relation)|on table)\s+"?([a-z_0-9]+)"?/i)?.[1];
  const context = table ? PERMISSION_CONTEXT_BY_TABLE[table.toLowerCase()] : undefined;
  return context
    ? `No tiene permiso para realizar esta acción sobre ${context}.`
    : PERMISSION_DENIED_MESSAGE;
}

type ErrorLike = { code?: unknown; message?: unknown; details?: unknown };

/** Mensaje legible de cualquier error (Error, PostgrestError o desconocido). */
export function errorMessage(error: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (!error) return fallback;
  const source: ErrorLike =
    error instanceof Error || (typeof error === 'object' && error !== null)
      ? (error as ErrorLike)
      : { message: String(error) };
  const code = source.code ? String(source.code) : '';
  const message = typeof source.message === 'string' ? source.message : '';
  const details = typeof source.details === 'string' ? source.details : '';

  // El nombre de la restricción es más específico que el código: se mira
  // primero, tanto en `message` como en `details` (PostgREST reparte el texto
  // entre ambos según el caso).
  const constraintName = `${message} ${details}`.match(/constraint "([a-z_0-9]+)"/i)?.[1];
  if (constraintName && constraintName in BY_CONSTRAINT) return BY_CONSTRAINT[constraintName];

  const permission = permissionDeniedMessage(code, message);
  if (permission) return permission;

  if (code && code in BY_CODE) return BY_CODE[code] || message || fallback;
  for (const [pattern, text] of BY_PATTERN) {
    if (pattern.test(message)) return text;
  }
  return message || fallback;
}

/**
 * Registra en consola un error que el código ya gestionó (hay caché, se
 * conserva la pantalla anterior, se deniega por prudencia…).
 *
 * Las caídas de red son el estado normal de una app que trabaja en ruta: si se
 * escriben con `console.error`, en una compilación de desarrollo LogBox pinta
 * la franja roja —o la pantalla completa— sobre la aplicación y llega a tapar
 * los avisos propios. Se degradan a `warn`; lo demás sigue siendo error.
 */
export function logHandledError(context: string, error: unknown): void {
  if (isNetworkErrorLike(error)) {
    console.warn(`${context}: sin conexión con el servidor.`);
    return;
  }
  console.error(`${context}:`, error);
}

/** Detección local, sin depender del módulo de sincronización. */
function isNetworkErrorLike(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error ?? '');
  return /network request failed|failed to fetch|networkerror|load failed|ERR_NETWORK|timeout/i.test(
    message
  );
}
