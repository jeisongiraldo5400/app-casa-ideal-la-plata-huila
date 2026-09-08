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
  '42501': 'No tienes permisos para realizar esta acción.',
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
  [/permission denied|row-level security/i, 'No tienes permisos para realizar esta acción.'],
  [/JWT expired|invalid JWT/i, 'La sesión expiró. Vuelve a iniciar sesión.'],
  [/AbortError|aborted/i, 'La operación fue cancelada.'],
];

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

  if (code && code in BY_CODE) return BY_CODE[code] || message || fallback;
  for (const [pattern, text] of BY_PATTERN) {
    if (pattern.test(message)) return text;
  }
  return message || fallback;
}
